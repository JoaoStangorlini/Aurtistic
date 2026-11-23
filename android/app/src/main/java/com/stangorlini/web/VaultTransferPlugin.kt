package com.stangorlini.web

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.provider.OpenableColumns
import androidx.activity.result.ActivityResult
import androidx.work.Constraints
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkInfo
import androidx.work.WorkManager
import androidx.work.workDataOf
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

@CapacitorPlugin(name = "VaultTransfer")
class VaultTransferPlugin : Plugin() {
    private val ioExecutor = Executors.newCachedThreadPool()

    @PluginMethod
    fun hasDeviceCredential(call: PluginCall) {
        val scopeKey = call.getString("credentialScopeKey") ?: return call.reject("credentialScopeKey obrigatório.")
        call.resolve(JSObject().put("hasCredential", VaultCredentialStore.hasCredential(context, scopeKey)))
    }

    @PluginMethod
    fun saveDeviceCredential(call: PluginCall) {
        val scopeKey = call.getString("credentialScopeKey") ?: return call.reject("credentialScopeKey obrigatório.")
        val tokenId = call.getString("tokenId") ?: return call.reject("tokenId obrigatório.")
        val secret = call.getString("secret") ?: return call.reject("secret obrigatório.")
        VaultCredentialStore.saveCredential(context, scopeKey, tokenId, secret)
        call.resolve(JSObject().put("ok", true))
    }

    @PluginMethod
    fun clearDeviceCredential(call: PluginCall) {
        val scopeKey = call.getString("credentialScopeKey") ?: return call.reject("credentialScopeKey obrigatório.")
        VaultCredentialStore.clearCredential(context, scopeKey)
        call.resolve(JSObject().put("ok", true))
    }

    @PluginMethod
    fun setLanConfig(call: PluginCall) {
        val url = call.getString("lanServerUrl") ?: ""
        val autoDetect = call.getBoolean("autoDetectLan") ?: true
        if (url.isNotBlank() && !VaultCredentialStore.isAllowedLanUrl(url)) {
            call.reject("Endereço LAN inválido: http:// só é permitido para IPs privados ou localhost.")
            return
        }
        VaultCredentialStore.saveLanConfig(context, url, autoDetect)
        call.resolve(JSObject().put("ok", true))
    }

    @PluginMethod
    fun getLanConfig(call: PluginCall) {
        val res = JSObject()
            .put("lanServerUrl", VaultCredentialStore.getLanUrl(context))
            .put("autoDetectLan", VaultCredentialStore.isLanAutoDetect(context))
        call.resolve(res)
    }

    @PluginMethod
    fun probeLan(call: PluginCall) {
        val serverUrl = (call.getString("serverUrl") ?: VaultCredentialStore.getLanUrl(context)).trim().trimEnd('/')
        val timeoutMs = call.getInt("timeoutMs") ?: 1500
        if (!VaultCredentialStore.isAllowedLanUrl(serverUrl)) {
            call.resolve(JSObject().put("reachable", false))
            return
        }
        ioExecutor.execute {
            val reachable = try {
                val conn = URL("$serverUrl/api/health").openConnection() as HttpURLConnection
                conn.connectTimeout = timeoutMs
                conn.readTimeout = timeoutMs
                conn.requestMethod = "GET"
                val ok = if (conn.responseCode in 200..299) {
                    val body = conn.inputStream?.bufferedReader()?.use { it.readText() } ?: "{}"
                    val json = JSONObject(body)
                    json.optBoolean("ok", false) && json.optString("service") == "aurtistic-edge"
                } else {
                    false
                }
                conn.disconnect()
                ok
            } catch (_: Exception) {
                false
            }
            call.resolve(JSObject().put("reachable", reachable))
        }
    }

    /**
     * Abre seletor nativo Android (ACTION_OPEN_DOCUMENT) devolvendo apenas content:// URIs
     * persistíveis + nome/tamanho, evitando Base64/OOM na bridge JS.
     */
    @PluginMethod
    fun pickFilesForUpload(call: PluginCall) {
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = "*/*"
            putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION)
        }
        startActivityForResult(call, intent, "handlePickFilesResult")
    }

    @ActivityCallback
    private fun handlePickFilesResult(call: PluginCall, result: ActivityResult) {
        if (result.resultCode != Activity.RESULT_OK || result.data == null) {
            call.resolve(JSObject().put("files", JSArray()))
            return
        }
        val uris = ArrayList<Uri>()
        val clip = result.data?.clipData
        if (clip != null) {
            for (i in 0 until clip.itemCount) {
                clip.getItemAt(i)?.uri?.let { uris.add(it) }
            }
        } else {
            result.data?.data?.let { uris.add(it) }
        }

        val arr = JSArray()
        for (uri in uris) {
            try {
                context.contentResolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
            } catch (_: Exception) {}

            var displayName = "arquivo"
            var sizeBytes = 0L
            context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)?.use { c ->
                if (c.moveToFirst()) {
                    val nameIdx = c.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                    val sizeIdx = c.getColumnIndex(OpenableColumns.SIZE)
                    if (nameIdx >= 0 && !c.isNull(nameIdx)) displayName = c.getString(nameIdx)
                    if (sizeIdx >= 0 && !c.isNull(sizeIdx)) sizeBytes = c.getLong(sizeIdx)
                }
            }
            arr.put(
                JSObject()
                    .put("uri", uri.toString())
                    .put("name", displayName)
                    .put("sizeBytes", sizeBytes)
            )
        }
        call.resolve(JSObject().put("files", arr))
    }

    @PluginMethod
    fun enqueueUpload(call: PluginCall) {
        val id = call.getString("id") ?: return call.reject("id obrigatório.")
        val localUri = call.getString("localUri") ?: return call.reject("localUri obrigatório.")
        val relPath = call.getString("relativePath") ?: return call.reject("relativePath obrigatório.")
        val filename = call.getString("filename") ?: relPath.substringAfterLast('/')
        val totalSize = call.getLong("totalSize") ?: -1L
        val scopeKey = call.getString("credentialScopeKey") ?: return call.reject("credentialScopeKey obrigatório.")
        val remoteUrl = call.getString("remoteServerUrl") ?: return call.reject("remoteServerUrl obrigatório.")
        val lanUrl = call.getString("lanServerUrl") ?: ""
        val overwrite = call.getBoolean("overwrite") ?: false

        val meta = JSONObject()
            .put("id", id)
            .put("direction", "upload")
            .put("localUri", localUri)
            .put("relativePath", relPath)
            .put("filename", filename)
            .put("totalSize", totalSize)
            .put("credentialScopeKey", scopeKey)
            .put("remoteServerUrl", remoteUrl)
            .put("lanServerUrl", lanUrl)
            .put("overwrite", overwrite)
        VaultCredentialStore.metaPrefs(context).edit()
            .putString("job_$id", meta.toString())
            .remove("paused_$id")
            .apply()

        val req = OneTimeWorkRequestBuilder<VaultTransferWorker>()
            .addTag("aurt_transfer")
            .addTag("aurt_transfer_$id")
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .setInputData(
                workDataOf(
                    VaultTransferWorker.KEY_TRANSFER_ID to id,
                    VaultTransferWorker.KEY_DIRECTION to "upload",
                    VaultTransferWorker.KEY_CREDENTIAL_SCOPE to scopeKey,
                    VaultTransferWorker.KEY_REMOTE_URL to remoteUrl,
                    VaultTransferWorker.KEY_LAN_URL to lanUrl,
                    VaultTransferWorker.KEY_REL_PATH to relPath,
                    VaultTransferWorker.KEY_FILENAME to filename,
                    VaultTransferWorker.KEY_LOCAL_URI to localUri,
                    VaultTransferWorker.KEY_TOTAL_SIZE to totalSize,
                    VaultTransferWorker.KEY_OVERWRITE to overwrite
                )
            )
            .build()

        WorkManager.getInstance(context).enqueueUniqueWork("aurt_tx_$id", ExistingWorkPolicy.REPLACE, req)
        call.resolve(JSObject().put("ok", true))
    }

    @PluginMethod
    fun enqueueDownload(call: PluginCall) {
        val id = call.getString("id") ?: return call.reject("id obrigatório.")
        val relPath = call.getString("relativePath") ?: return call.reject("relativePath obrigatório.")
        val filename = call.getString("filename") ?: relPath.substringAfterLast('/')
        val subfolder = call.getString("subfolder") ?: ""
        val scopeKey = call.getString("credentialScopeKey") ?: return call.reject("credentialScopeKey obrigatório.")
        val remoteUrl = call.getString("remoteServerUrl") ?: return call.reject("remoteServerUrl obrigatório.")
        val lanUrl = call.getString("lanServerUrl") ?: ""

        val meta = JSONObject()
            .put("id", id)
            .put("direction", "download")
            .put("relativePath", relPath)
            .put("filename", filename)
            .put("subfolder", subfolder)
            .put("credentialScopeKey", scopeKey)
            .put("remoteServerUrl", remoteUrl)
            .put("lanServerUrl", lanUrl)
        VaultCredentialStore.metaPrefs(context).edit()
            .putString("job_$id", meta.toString())
            .remove("paused_$id")
            .apply()

        val req = OneTimeWorkRequestBuilder<VaultTransferWorker>()
            .addTag("aurt_transfer")
            .addTag("aurt_transfer_$id")
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .setInputData(
                workDataOf(
                    VaultTransferWorker.KEY_TRANSFER_ID to id,
                    VaultTransferWorker.KEY_DIRECTION to "download",
                    VaultTransferWorker.KEY_CREDENTIAL_SCOPE to scopeKey,
                    VaultTransferWorker.KEY_REMOTE_URL to remoteUrl,
                    VaultTransferWorker.KEY_LAN_URL to lanUrl,
                    VaultTransferWorker.KEY_REL_PATH to relPath,
                    VaultTransferWorker.KEY_FILENAME to filename,
                    VaultTransferWorker.KEY_SUBFOLDER to subfolder
                )
            )
            .build()

        WorkManager.getInstance(context).enqueueUniqueWork("aurt_tx_$id", ExistingWorkPolicy.REPLACE, req)
        call.resolve(JSObject().put("ok", true))
    }

    @PluginMethod
    fun pauseTransfer(call: PluginCall) {
        val id = call.getString("id") ?: return call.reject("id obrigatório.")
        // Marca como pausado mantendo .part / .uploadId para retomada real
        VaultCredentialStore.metaPrefs(context).edit().putBoolean("paused_$id", true).apply()
        WorkManager.getInstance(context).cancelUniqueWork("aurt_tx_$id")
        call.resolve(JSObject().put("ok", true))
    }

    @PluginMethod
    fun resumeTransfer(call: PluginCall) {
        val id = call.getString("id") ?: return call.reject("id obrigatório.")
        val raw = VaultCredentialStore.metaPrefs(context).getString("job_$id", null)
            ?: return call.reject("Metadados da transferência não encontrados.")
        val meta = JSONObject(raw)
        VaultCredentialStore.metaPrefs(context).edit().remove("paused_$id").apply()

        val direction = meta.optString("direction", "download")
        val builder = OneTimeWorkRequestBuilder<VaultTransferWorker>()
            .addTag("aurt_transfer")
            .addTag("aurt_transfer_$id")
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())

        if (direction == "upload") {
            builder.setInputData(
                workDataOf(
                    VaultTransferWorker.KEY_TRANSFER_ID to id,
                    VaultTransferWorker.KEY_DIRECTION to "upload",
                    VaultTransferWorker.KEY_CREDENTIAL_SCOPE to meta.getString("credentialScopeKey"),
                    VaultTransferWorker.KEY_REMOTE_URL to meta.getString("remoteServerUrl"),
                    VaultTransferWorker.KEY_LAN_URL to meta.optString("lanServerUrl", ""),
                    VaultTransferWorker.KEY_REL_PATH to meta.getString("relativePath"),
                    VaultTransferWorker.KEY_FILENAME to meta.getString("filename"),
                    VaultTransferWorker.KEY_LOCAL_URI to meta.getString("localUri"),
                    VaultTransferWorker.KEY_TOTAL_SIZE to meta.getLong("totalSize"),
                    VaultTransferWorker.KEY_OVERWRITE to meta.optBoolean("overwrite", false)
                )
            )
        } else {
            builder.setInputData(
                workDataOf(
                    VaultTransferWorker.KEY_TRANSFER_ID to id,
                    VaultTransferWorker.KEY_DIRECTION to "download",
                    VaultTransferWorker.KEY_CREDENTIAL_SCOPE to meta.getString("credentialScopeKey"),
                    VaultTransferWorker.KEY_REMOTE_URL to meta.getString("remoteServerUrl"),
                    VaultTransferWorker.KEY_LAN_URL to meta.optString("lanServerUrl", ""),
                    VaultTransferWorker.KEY_REL_PATH to meta.getString("relativePath"),
                    VaultTransferWorker.KEY_FILENAME to meta.getString("filename"),
                    VaultTransferWorker.KEY_SUBFOLDER to meta.optString("subfolder", "")
                )
            )
        }
        WorkManager.getInstance(context).enqueueUniqueWork("aurt_tx_$id", ExistingWorkPolicy.REPLACE, builder.build())
        call.resolve(JSObject().put("ok", true))
    }

    @PluginMethod
    fun cancelTransfer(call: PluginCall) {
        val id = call.getString("id") ?: return call.reject("id obrigatório.")
        WorkManager.getInstance(context).cancelUniqueWork("aurt_tx_$id")
        VaultCredentialStore.metaPrefs(context).edit()
            .remove("paused_$id")
            .remove("job_$id")
            .apply()
        File(File(context.cacheDir, "aurt_dl_parts"), "${id}.part").delete()
        File(File(context.cacheDir, "aurt_dl_parts"), "${id}.etag").delete()
        File(File(context.cacheDir, "aurt_tx_meta"), "${id}.uploadId").delete()
        call.resolve(JSObject().put("ok", true))
    }

    @PluginMethod
    fun listTransfers(call: PluginCall) {
        ioExecutor.execute {
            val infos = WorkManager.getInstance(context).getWorkInfosByTag("aurt_transfer").get()
            val arr = JSArray()
            val seen = HashSet<String>()
            val metaPrefs = VaultCredentialStore.metaPrefs(context)
            for (info in infos) {
                val id = info.progress.getString("transferId")
                    ?: info.outputData.getString("transferId")
                    ?: info.tags.firstOrNull { it.startsWith("aurt_transfer_") }?.removePrefix("aurt_transfer_")
                    ?: continue
                if (!seen.add(id)) continue

                val isPaused = metaPrefs.getBoolean("paused_$id", false)
                val progressState = info.progress.getString("state")
                val stateStr = when {
                    isPaused && info.state == WorkInfo.State.CANCELLED -> "paused"
                    progressState == "finalizing" && info.state == WorkInfo.State.RUNNING -> "finalizing"
                    info.state == WorkInfo.State.RUNNING -> "running"
                    info.state == WorkInfo.State.ENQUEUED || info.state == WorkInfo.State.BLOCKED -> "queued"
                    info.state == WorkInfo.State.SUCCEEDED -> "completed"
                    info.state == WorkInfo.State.FAILED -> "failed"
                    info.state == WorkInfo.State.CANCELLED -> "cancelled"
                    else -> "queued"
                }
                val item = JSObject()
                    .put("id", id)
                    .put("state", stateStr)
                    .put("progressPercent", info.progress.getInt("progress", if (stateStr == "completed") 100 else 0))
                val errMsg = info.outputData.getString("error")
                val errCode = info.outputData.getString("errorCode")
                if (!errMsg.isNullOrBlank()) item.put("error", errMsg)
                if (!errCode.isNullOrBlank()) item.put("errorCode", errCode)
                arr.put(item)
            }
            call.resolve(JSObject().put("transfers", arr))
        }
    }
}
