package com.stangorlini.web

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.ContentValues
import android.content.Context
import android.content.SharedPreferences
import android.content.pm.ServiceInfo
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.util.Base64
import androidx.core.app.NotificationCompat
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import androidx.work.ForegroundInfo
import androidx.work.Worker
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import org.json.JSONObject
import java.io.BufferedInputStream
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.security.MessageDigest

object VaultCredentialStore {
    private const val PREF_FILE = "aurtistic_vault_keystore_prefs"
    private const val META_PREF_FILE = "aurtistic_vault_transfer_meta"

    private fun openEncryptedPrefs(ctx: Context): SharedPreferences {
        val masterKey = MasterKey.Builder(ctx)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        return EncryptedSharedPreferences.create(
            ctx,
            PREF_FILE,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    }

    private fun prefs(ctx: Context): SharedPreferences = try {
        openEncryptedPrefs(ctx)
    } catch (_: Exception) {
        // Recuperação caso Keystore tenha invalidado após reinstalação/backup parcial
        try {
            ctx.deleteSharedPreferences(PREF_FILE)
            openEncryptedPrefs(ctx)
        } catch (_: Exception) {
            ctx.getSharedPreferences("${PREF_FILE}_fallback", Context.MODE_PRIVATE)
        }
    }

    fun metaPrefs(ctx: Context): SharedPreferences =
        ctx.getSharedPreferences(META_PREF_FILE, Context.MODE_PRIVATE)

    fun saveCredential(ctx: Context, scopeKey: String, tokenId: String, secret: String) {
        val raw = "$tokenId:$secret"
        val basic = "Basic " + Base64.encodeToString(raw.toByteArray(Charsets.UTF_8), Base64.NO_WRAP)
        prefs(ctx).edit().putString("auth_$scopeKey", basic).apply()
    }

    fun hasCredential(ctx: Context, scopeKey: String): Boolean {
        return !prefs(ctx).getString("auth_$scopeKey", null).isNullOrBlank()
    }

    fun getBasicHeader(ctx: Context, scopeKey: String): String? {
        return prefs(ctx).getString("auth_$scopeKey", null)
    }

    fun clearCredential(ctx: Context, scopeKey: String) {
        prefs(ctx).edit().remove("auth_$scopeKey").apply()
    }

    fun isAllowedLanUrl(rawUrl: String): Boolean {
        val clean = rawUrl.trim()
        if (clean.isBlank()) return false
        return try {
            val u = URL(clean)
            if (u.protocol.equals("https", ignoreCase = true)) return true
            if (!u.protocol.equals("http", ignoreCase = true)) return false
            val host = (u.host ?: "").lowercase()
            host == "localhost" ||
                host == "127.0.0.1" ||
                host.endsWith(".local") ||
                host.startsWith("192.168.") ||
                host.startsWith("10.") ||
                Regex("^172\\.(1[6-9]|2[0-9]|3[0-1])\\.").containsMatchIn(host)
        } catch (_: Exception) {
            false
        }
    }

    fun saveLanConfig(ctx: Context, lanUrl: String, autoDetect: Boolean) {
        val trimmed = lanUrl.trim().trimEnd('/')
        val safeUrl = if (trimmed.isNotBlank() && isAllowedLanUrl(trimmed)) trimmed else ""
        metaPrefs(ctx).edit()
            .putString("lan_server_url", safeUrl)
            .putBoolean("lan_auto_detect", autoDetect)
            .apply()
    }

    fun getLanUrl(ctx: Context): String =
        metaPrefs(ctx).getString("lan_server_url", "") ?: ""

    fun isLanAutoDetect(ctx: Context): Boolean =
        metaPrefs(ctx).getBoolean("lan_auto_detect", true)
}

class VaultTransferWorker(
    appContext: Context,
    params: WorkerParameters
) : Worker(appContext, params) {

    companion object {
        const val CHANNEL_ID = "aurtistic_vault_transfers"
        const val KEY_TRANSFER_ID = "transferId"
        const val KEY_DIRECTION = "direction"
        const val KEY_CREDENTIAL_SCOPE = "credentialScopeKey"
        const val KEY_REMOTE_URL = "remoteServerUrl"
        const val KEY_LAN_URL = "lanServerUrl"
        const val KEY_REL_PATH = "relativePath"
        const val KEY_FILENAME = "filename"
        const val KEY_LOCAL_URI = "localUri"
        const val KEY_SUBFOLDER = "subfolder"
        const val KEY_TOTAL_SIZE = "totalSize"
        const val KEY_OVERWRITE = "overwrite"
    }

    private fun ensureChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val nm = applicationContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            if (nm.getNotificationChannel(CHANNEL_ID) == null) {
                val ch = NotificationChannel(
                    CHANNEL_ID,
                    "Transferências do Cofre",
                    NotificationManager.IMPORTANCE_LOW
                )
                nm.createNotificationChannel(ch)
            }
        }
    }

    private fun updateForegroundSafe(
        notifId: Int,
        title: String,
        subtitle: String,
        progress: Int,
        indeterminate: Boolean
    ) {
        try {
            ensureChannel()
            val notif = NotificationCompat.Builder(applicationContext, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.stat_sys_download)
                .setContentTitle(title)
                .setContentText(subtitle)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setProgress(100, progress.coerceIn(0, 100), indeterminate)
                .build()

            val info = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ForegroundInfo(notifId, notif, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
            } else {
                ForegroundInfo(notifId, notif)
            }
            setForegroundAsync(info)
        } catch (_: Exception) {
            // Tratamento gracioso caso POST_NOTIFICATIONS negada ou restrição de background no Android 13-15
        }
    }

    private fun probeLanReachable(lanUrl: String): Boolean {
        if (!VaultCredentialStore.isAllowedLanUrl(lanUrl)) return false
        return try {
            val conn = URL("${lanUrl.trimEnd('/')}/api/health").openConnection() as HttpURLConnection
            conn.connectTimeout = 1500
            conn.readTimeout = 1500
            conn.requestMethod = "GET"
            val code = conn.responseCode
            if (code !in 200..299) {
                conn.disconnect()
                return false
            }
            val body = conn.inputStream?.bufferedReader()?.use { it.readText() } ?: "{}"
            conn.disconnect()
            val json = JSONObject(body)
            json.optBoolean("ok", false) && json.optString("service") == "aurtistic-edge"
        } catch (_: Exception) {
            false
        }
    }

    private fun resolveActiveBaseUrl(remoteUrl: String, explicitLan: String): String {
        val lan = explicitLan.ifBlank { VaultCredentialStore.getLanUrl(applicationContext) }
        if (VaultCredentialStore.isLanAutoDetect(applicationContext) && lan.isNotBlank() && probeLanReachable(lan)) {
            return lan.trimEnd('/')
        }
        return remoteUrl.trimEnd('/')
    }

    private fun isUnmeteredWifi(): Boolean {
        val cm = applicationContext.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager ?: return false
        val net = cm.activeNetwork ?: return false
        val caps = cm.getNetworkCapabilities(net) ?: return false
        return caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) &&
            caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED)
    }

    private fun selectChunkSize(baseUrl: String): Int {
        val low = baseUrl.lowercase()
        if (low.startsWith("http://192.168.") || low.startsWith("http://10.") || low.startsWith("http://172.")) {
            return 32 * 1024 * 1024
        }
        return if (isUnmeteredWifi()) 16 * 1024 * 1024 else 8 * 1024 * 1024
    }

    override fun doWork(): Result {
        val transferId = inputData.getString(KEY_TRANSFER_ID) ?: return Result.failure()
        val direction = inputData.getString(KEY_DIRECTION) ?: return Result.failure()
        val scopeKey = inputData.getString(KEY_CREDENTIAL_SCOPE) ?: return Result.failure()
        val remoteUrl = inputData.getString(KEY_REMOTE_URL) ?: return Result.failure()
        val explicitLan = inputData.getString(KEY_LAN_URL) ?: ""
        val relPath = inputData.getString(KEY_REL_PATH) ?: return Result.failure()
        val filename = inputData.getString(KEY_FILENAME) ?: relPath.substringAfterLast('/')

        val basicAuth = VaultCredentialStore.getBasicHeader(applicationContext, scopeKey)
            ?: return Result.failure(
                workDataOf("transferId" to transferId, "errorCode" to "CREDENTIAL_MISSING", "error" to "Credencial segura não encontrada.")
            )

        val notifId = transferId.hashCode()
        updateForegroundSafe(notifId, filename, "Preparando transferência...", 0, true)

        return try {
            val baseUrl = resolveActiveBaseUrl(remoteUrl, explicitLan)
            if (direction == "upload") {
                runChunkedUpload(notifId, transferId, scopeKey, baseUrl, basicAuth, relPath, filename)
            } else {
                runResumableDownload(notifId, transferId, scopeKey, baseUrl, basicAuth, relPath, filename)
            }
        } catch (e: Exception) {
            Result.failure(workDataOf("transferId" to transferId, "error" to (e.message ?: "Erro na transferência.")))
        }
    }

    private fun readJsonResponse(conn: HttpURLConnection): JSONObject {
        val stream = if (conn.responseCode in 200..299) conn.inputStream else conn.errorStream
        val text = stream?.bufferedReader()?.use { it.readText() } ?: "{}"
        return try { JSONObject(text) } catch (_: Exception) { JSONObject() }
    }

    private fun handleAuthOrPinFailure(transferId: String, scopeKey: String, code: Int, msg: String): Result? {
        if (code == 401) {
            VaultCredentialStore.clearCredential(applicationContext, scopeKey)
            return Result.failure(
                workDataOf("transferId" to transferId, "errorCode" to "CREDENTIAL_REVOKED", "error" to "Credencial expirada ou revogada.")
            )
        }
        if (code == 423) {
            return Result.failure(
                workDataOf("transferId" to transferId, "errorCode" to "PIN_LOCKED", "error" to "Pasta protegida por PIN: abra e envie pelo app.")
            )
        }
        if (code == 403) {
            return Result.failure(
                workDataOf("transferId" to transferId, "errorCode" to "FORBIDDEN", "error" to msg)
            )
        }
        return null
    }

    private fun runChunkedUpload(
        notifId: Int,
        transferId: String,
        scopeKey: String,
        baseUrl: String,
        basicAuth: String,
        relPath: String,
        filename: String
    ): Result {
        val localUriStr = inputData.getString(KEY_LOCAL_URI) ?: return Result.failure()
        val uri = Uri.parse(localUriStr)
        val totalSize = inputData.getLong(KEY_TOTAL_SIZE, -1L)
        if (totalSize < 0L) return Result.failure(workDataOf("transferId" to transferId, "error" to "totalSize inválido."))

        val overwrite = inputData.getBoolean(KEY_OVERWRITE, false)
        val chunkSize = selectChunkSize(baseUrl)
        val metaDir = File(applicationContext.cacheDir, "aurt_tx_meta").apply { mkdirs() }
        val uploadIdFile = File(metaDir, "${transferId}.uploadId")

        var uploadId = if (uploadIdFile.exists()) uploadIdFile.readText().trim() else ""
        var serverChunkSize = chunkSize
        var totalChunks = if (totalSize == 0L) 1 else ((totalSize + chunkSize - 1) / chunkSize).toInt()
        val uploadedSet = HashSet<Int>()

        if (uploadId.isNotBlank()) {
            val stConn = (URL("$baseUrl/api/tenant/upload/chunked/$uploadId/status").openConnection() as HttpURLConnection).apply {
                requestMethod = "GET"
                setRequestProperty("Authorization", basicAuth)
            }
            val stCode = stConn.responseCode
            val stJson = readJsonResponse(stConn)
            stConn.disconnect()
            handleAuthOrPinFailure(transferId, scopeKey, stCode, stJson.optString("error"))?.let { return it }
            if (stCode == 200) {
                if (stJson.optString("state") == "completed") {
                    uploadIdFile.delete()
                    return Result.success(workDataOf("transferId" to transferId, "state" to "completed"))
                }
                serverChunkSize = stJson.optInt("chunkSize", chunkSize)
                totalChunks = stJson.optInt("totalChunks", totalChunks)
                val arr = stJson.optJSONArray("uploadedChunks")
                if (arr != null) {
                    for (j in 0 until arr.length()) uploadedSet.add(arr.getInt(j))
                }
            } else {
                uploadId = ""
            }
        }

        if (uploadId.isBlank()) {
            val initConn = (URL("$baseUrl/api/tenant/upload/chunked/init").openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                setRequestProperty("Authorization", basicAuth)
                setRequestProperty("Content-Type", "application/json")
                doOutput = true
            }
            val initBody = JSONObject().apply {
                put("relPath", relPath)
                put("totalSize", totalSize)
                put("chunkSize", chunkSize)
                put("overwrite", overwrite)
            }
            initConn.outputStream.use { it.write(initBody.toString().toByteArray(Charsets.UTF_8)) }
            val initCode = initConn.responseCode
            val initJson = readJsonResponse(initConn)
            initConn.disconnect()

            handleAuthOrPinFailure(transferId, scopeKey, initCode, initJson.optString("error", "Sem permissão."))?.let { return it }
            if (initCode !in 200..299) {
                return Result.failure(workDataOf("transferId" to transferId, "error" to initJson.optString("error", "Falha /init ($initCode)")))
            }

            uploadId = initJson.getString("uploadId")
            serverChunkSize = initJson.optInt("chunkSize", chunkSize)
            totalChunks = initJson.optInt("totalChunks", 1)
            uploadIdFile.writeText(uploadId)
        }

        var uploadedBytes = 0L
        val buf = ByteArray(64 * 1024)
        applicationContext.contentResolver.openInputStream(uri)?.use { rawIn ->
            val input = BufferedInputStream(rawIn, 64 * 1024)
            for (idx in 0 until totalChunks) {
                if (isStopped) return Result.retry()

                val expectedLen = if (totalSize == 0L) 0 else minOf(serverChunkSize.toLong(), totalSize - idx.toLong() * serverChunkSize).toInt()
                if (uploadedSet.contains(idx)) {
                    // Pula bytes já aceitos pelo servidor em retomada
                    var toSkip = expectedLen.toLong()
                    while (toSkip > 0) {
                        val skipped = input.skip(toSkip)
                        if (skipped <= 0) {
                            if (input.read(buf, 0, minOf(buf.size.toLong(), toSkip).toInt()) <= 0) break
                            toSkip--
                        } else {
                            toSkip -= skipped
                        }
                    }
                    uploadedBytes += expectedLen
                    continue
                }

                val chunkOut = ByteArrayOutputStream(expectedLen)
                val sha = MessageDigest.getInstance("SHA-256")
                var remaining = expectedLen
                while (remaining > 0) {
                    val toRead = minOf(buf.size, remaining)
                    val n = input.read(buf, 0, toRead)
                    if (n <= 0) break
                    chunkOut.write(buf, 0, n)
                    sha.update(buf, 0, n)
                    remaining -= n
                }
                val chunkBytes = chunkOut.toByteArray()
                val chunkSha = sha.digest().joinToString("") { "%02x".format(it) }

                val putConn = (URL("$baseUrl/api/tenant/upload/chunked/$uploadId/$idx").openConnection() as HttpURLConnection).apply {
                    requestMethod = "PUT"
                    setRequestProperty("Authorization", basicAuth)
                    setRequestProperty("Content-Type", "application/octet-stream")
                    setRequestProperty("x-chunk-sha256", chunkSha)
                    doOutput = true
                    setFixedLengthStreamingMode(chunkBytes.size)
                }
                putConn.outputStream.use { it.write(chunkBytes) }
                val putCode = putConn.responseCode
                val putJson = readJsonResponse(putConn)
                putConn.disconnect()
                handleAuthOrPinFailure(transferId, scopeKey, putCode, putJson.optString("error"))?.let { return it }
                if (putCode !in 200..299) {
                    return Result.retry()
                }

                uploadedBytes += chunkBytes.size
                val pct = if (totalSize <= 0L) 100 else ((uploadedBytes * 100L) / totalSize).toInt().coerceIn(0, 99)
                setProgressAsync(workDataOf("transferId" to transferId, "progress" to pct, "state" to "running"))
                updateForegroundSafe(notifId, "Enviando $filename", "$pct%", pct, false)
            }
        } ?: return Result.failure(workDataOf("transferId" to transferId, "error" to "Não foi possível abrir arquivo local."))

        setProgressAsync(workDataOf("transferId" to transferId, "progress" to 100, "state" to "finalizing"))
        updateForegroundSafe(notifId, filename, "Finalizando e criptografando no servidor...", 100, true)

        val compConn = (URL("$baseUrl/api/tenant/upload/chunked/$uploadId/complete").openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            setRequestProperty("Authorization", basicAuth)
            setRequestProperty("Content-Type", "application/json")
            doOutput = true
        }
        compConn.outputStream.use { it.write("{}".toByteArray()) }
        val compCode = compConn.responseCode
        val compJson = readJsonResponse(compConn)
        compConn.disconnect()

        handleAuthOrPinFailure(transferId, scopeKey, compCode, compJson.optString("error"))?.let { return it }
        if (compCode == 200 && compJson.optString("state") == "completed") {
            uploadIdFile.delete()
            return Result.success(workDataOf("transferId" to transferId, "state" to "completed"))
        }
        if (compCode != 202) {
            return Result.failure(workDataOf("transferId" to transferId, "error" to compJson.optString("error", "Falha /complete ($compCode)")))
        }

        val pollPath = compJson.optString("pollUrl", "/api/tenant/upload/chunked/$uploadId/status")
        val pollUrl = if (pollPath.startsWith("http")) pollPath else "$baseUrl$pollPath"

        while (!isStopped) {
            Thread.sleep(1500)
            val stConn = (URL(pollUrl).openConnection() as HttpURLConnection).apply {
                requestMethod = "GET"
                setRequestProperty("Authorization", basicAuth)
            }
            val stCode = stConn.responseCode
            val stJson = readJsonResponse(stConn)
            stConn.disconnect()
            val state = stJson.optString("state")
            if (stCode == 200 && state == "completed") {
                uploadIdFile.delete()
                return Result.success(workDataOf("transferId" to transferId, "state" to "completed"))
            }
            if (stCode !in 200..299 || state == "failed") {
                return Result.failure(workDataOf("transferId" to transferId, "error" to stJson.optString("error", "Falha ao finalizar no servidor.")))
            }
        }
        return Result.retry()
    }

    private fun runResumableDownload(
        notifId: Int,
        transferId: String,
        scopeKey: String,
        baseUrl: String,
        basicAuth: String,
        relPath: String,
        filename: String
    ): Result {
        val encodedPath = URLEncoder.encode(relPath, "UTF-8")
        val streamUrl = "$baseUrl/api/tenant/stream?path=$encodedPath&download=1"

        val headConn = (URL(streamUrl).openConnection() as HttpURLConnection).apply {
            requestMethod = "HEAD"
            setRequestProperty("Authorization", basicAuth)
        }
        val headCode = headConn.responseCode
        val totalBytes = headConn.getHeaderFieldLong("Content-Length", -1L)
        val etag = headConn.getHeaderField("ETag") ?: ""
        val expectedSha = headConn.getHeaderField("X-Plaintext-Sha256") ?: ""
        headConn.disconnect()

        handleAuthOrPinFailure(transferId, scopeKey, headCode, "Acesso negado ($headCode)")?.let { return it }
        if (headCode !in 200..299 || totalBytes < 0L) {
            return Result.failure(workDataOf("transferId" to transferId, "error" to "Falha HEAD download ($headCode)"))
        }

        val partDir = File(applicationContext.cacheDir, "aurt_dl_parts").apply { mkdirs() }
        val partFile = File(partDir, "${transferId}.part")
        val etagFile = File(partDir, "${transferId}.etag")
        if (etagFile.exists() && etag.isNotBlank() && etagFile.readText() != etag) {
            partFile.delete()
        }
        if (etag.isNotBlank()) etagFile.writeText(etag)

        var downloaded = if (partFile.exists()) partFile.length() else 0L
        if (downloaded > totalBytes) {
            partFile.delete()
            downloaded = 0L
        }

        val sliceSize = 8L * 1024L * 1024L
        val buf = ByteArray(64 * 1024)
        while (downloaded < totalBytes) {
            if (isStopped) return Result.retry()
            val end = minOf(totalBytes - 1L, downloaded + sliceSize - 1L)
            val getConn = (URL(streamUrl).openConnection() as HttpURLConnection).apply {
                requestMethod = "GET"
                setRequestProperty("Authorization", basicAuth)
                setRequestProperty("Range", "bytes=$downloaded-$end")
                if (etag.isNotBlank()) setRequestProperty("If-Range", etag)
            }
            val code = getConn.responseCode
            if (code == 200) {
                // If-Range divergente -> zera parcial e recomeça do byte 0
                partFile.delete()
                downloaded = 0L
                val newEtag = getConn.getHeaderField("ETag") ?: ""
                if (newEtag.isNotBlank()) etagFile.writeText(newEtag)
            } else if (code != 206) {
                getConn.disconnect()
                handleAuthOrPinFailure(transferId, scopeKey, code, "Erro HTTP $code")?.let { return it }
                return Result.retry()
            }

            FileOutputStream(partFile, code == 206).use { out ->
                getConn.inputStream.use { inp ->
                    while (true) {
                        val n = inp.read(buf)
                        if (n <= 0) break
                        out.write(buf, 0, n)
                        downloaded += n
                    }
                }
            }
            getConn.disconnect()

            val pct = if (totalBytes <= 0L) 100 else ((downloaded * 100L) / totalBytes).toInt().coerceIn(0, 100)
            setProgressAsync(workDataOf("transferId" to transferId, "progress" to pct, "state" to "running"))
            updateForegroundSafe(notifId, "Baixando $filename", "$pct%", pct, false)
        }

        if (expectedSha.isNotBlank()) {
            val md = MessageDigest.getInstance("SHA-256")
            if (partFile.exists()) {
                FileInputStream(partFile).use { fis ->
                    while (true) {
                        val n = fis.read(buf)
                        if (n <= 0) break
                        md.update(buf, 0, n)
                    }
                }
            }
            val actualSha = md.digest().joinToString("") { "%02x".format(it) }
            if (!actualSha.equals(expectedSha, ignoreCase = true)) {
                partFile.delete()
                etagFile.delete()
                return Result.failure(workDataOf("transferId" to transferId, "error" to "Checksum SHA-256 divergente."))
            }
        }

        val subfolder = (inputData.getString(KEY_SUBFOLDER) ?: "").trim('/')
        val relativeDownloadDir = if (subfolder.isNotBlank()) {
            "${Environment.DIRECTORY_DOWNLOADS}/Aurtistic/$subfolder"
        } else {
            "${Environment.DIRECTORY_DOWNLOADS}/Aurtistic"
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val values = ContentValues().apply {
                put(MediaStore.Downloads.DISPLAY_NAME, filename)
                put(MediaStore.Downloads.RELATIVE_PATH, relativeDownloadDir)
                put(MediaStore.Downloads.IS_PENDING, 1)
            }
            val resolver = applicationContext.contentResolver
            val itemUri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                ?: return Result.failure(workDataOf("transferId" to transferId, "error" to "Falha ao criar destino no MediaStore."))
            try {
                resolver.openOutputStream(itemUri)?.use { out ->
                    if (partFile.exists()) {
                        FileInputStream(partFile).use { inp -> inp.copyTo(out) }
                    }
                }
                values.clear()
                values.put(MediaStore.Downloads.IS_PENDING, 0)
                resolver.update(itemUri, values, null, null)
            } catch (e: Exception) {
                resolver.delete(itemUri, null, null)
                throw e
            }
        } else {
            val dir = File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "Aurtistic").apply { mkdirs() }
            if (partFile.exists()) {
                partFile.copyTo(File(dir, filename), overwrite = true)
            } else {
                File(dir, filename).createNewFile()
            }
        }

        partFile.delete()
        etagFile.delete()
        return Result.success(workDataOf("transferId" to transferId, "state" to "completed"))
    }
}
