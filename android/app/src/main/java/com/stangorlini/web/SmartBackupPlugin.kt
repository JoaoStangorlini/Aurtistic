package com.stangorlini.web

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.media.MediaScannerConnection
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.Uri
import android.os.Build
import android.provider.DocumentsContract
import androidx.exifinterface.media.ExifInterface
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ListenableWorker
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileOutputStream
import java.security.MessageDigest
import java.util.concurrent.TimeUnit

@CapacitorPlugin(name = "SmartBackup")
class SmartBackupPlugin : Plugin() {

    @PluginMethod
    fun isUnmeteredWifi(call: PluginCall) {
        val ok = checkUnmeteredWifi(context)
        val res = JSObject()
        res.put("unmeteredWifi", ok)
        call.resolve(res)
    }

    @PluginMethod
    fun deleteLocalFile(call: PluginCall) {
        val uriStr = call.getString("uri")
        if (uriStr.isNullOrBlank()) {
            call.reject("URI ausente.")
            return
        }
        try {
            val uri = Uri.parse(uriStr)
            var deleted = false
            if (uri.scheme == "file") {
                deleted = File(uri.path ?: "").delete()
            } else {
                deleted = context.contentResolver.delete(uri, null, null) > 0
                if (!deleted && Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
                    deleted = DocumentsContract.deleteDocument(context.contentResolver, uri)
                }
            }
            val res = JSObject()
            res.put("deleted", deleted)
            call.resolve(res)
        } catch (e: Exception) {
            call.reject("Falha ao remover arquivo local: ${e.message}")
        }
    }

    @PluginMethod
    fun replaceWithCompressedProxy(call: PluginCall) {
        val uriStr = call.getString("uri")
        val origSha = call.getString("originalSha256") ?: ""
        val origSize = call.getLong("originalSizeBytes") ?: 0L
        val maxEdgePx = call.getInt("maxEdgePx") ?: 1600
        val quality = (call.getInt("quality") ?: 78).coerceIn(40, 95)

        if (uriStr.isNullOrBlank() || origSha.isBlank()) {
            call.reject("Parâmetros uri e originalSha256 são obrigatórios.")
            return
        }

        try {
            val uri = Uri.parse(uriStr)
            val inputStream = context.contentResolver.openInputStream(uri)
                ?: throw IllegalStateException("Não foi possível abrir o arquivo local.")
            val originalBitmap = inputStream.use { BitmapFactory.decodeStream(it) }
                ?: throw IllegalStateException("Falha ao decodificar bitmap.")

            val w = originalBitmap.width
            val h = originalBitmap.height
            val scale = minOf(1.0f, maxEdgePx.toFloat() / maxOf(w, h).toFloat())
            val targetW = maxOf(1, (w * scale).toInt())
            val targetH = maxOf(1, (h * scale).toInt())
            val scaledBitmap = if (scale < 1.0f) {
                Bitmap.createScaledBitmap(originalBitmap, targetW, targetH, true)
            } else {
                originalBitmap
            }

            val baos = ByteArrayOutputStream()
            scaledBitmap.compress(Bitmap.CompressFormat.JPEG, quality, baos)
            if (scaledBitmap != originalBitmap) scaledBitmap.recycle()
            originalBitmap.recycle()

            val marker = "\nAURTISTIC_PROXY_OF:$origSha:$origSize"
            val tempFile = File.createTempFile("aurtistic_proxy_", ".jpg", context.cacheDir)
            FileOutputStream(tempFile).use { fos ->
                fos.write(baos.toByteArray())
            }

            // Grava tag EXIF UserComment e anexa trailer binário
            val exif = ExifInterface(tempFile.absolutePath)
            exif.setAttribute(ExifInterface.TAG_USER_COMMENT, "AURTISTIC_PROXY_OF:$origSha:$origSize")
            exif.saveAttributes()

            FileOutputStream(tempFile, true).use { fos ->
                fos.write(marker.toByteArray(Charsets.ISO_8859_1))
            }

            val compressedBytes = tempFile.readBytes()
            val proxyHash = sha256Hex(compressedBytes)

            context.contentResolver.openOutputStream(uri, "wt")?.use { out ->
                out.write(compressedBytes)
            }

            if (uri.scheme == "file" && uri.path != null) {
                MediaScannerConnection.scanFile(context, arrayOf(uri.path!!), arrayOf("image/jpeg"), null)
            }
            tempFile.delete()

            val res = JSObject()
            res.put("compressedProxyHash", proxyHash)
            res.put("compressedSizeBytes", compressedBytes.size)
            call.resolve(res)
        } catch (e: Exception) {
            call.reject("Erro ao gerar proxy comprimido: ${e.message}")
        }
    }

    @PluginMethod
    fun configureBackgroundSync(call: PluginCall) {
        val enabled = call.getBoolean("enabled", false) ?: false
        val wifiOnly = call.getBoolean("wifiOnly", true) ?: true
        val workManager = WorkManager.getInstance(context)
        val workName = "aurtistic_smart_backup_periodic"

        if (!enabled) {
            workManager.cancelUniqueWork(workName)
            val res = JSObject()
            res.put("scheduled", false)
            call.resolve(res)
            return
        }

        val constraints = Constraints.Builder()
            .setRequiredNetworkType(if (wifiOnly) NetworkType.UNMETERED else NetworkType.CONNECTED)
            .setRequiresBatteryNotLow(true)
            .build()

        val request = PeriodicWorkRequestBuilder<SmartBackupWorker>(12, TimeUnit.HOURS)
            .setConstraints(constraints)
            .build()

        workManager.enqueueUniquePeriodicWork(
            workName,
            ExistingPeriodicWorkPolicy.UPDATE,
            request
        )

        val res = JSObject()
        res.put("scheduled", true)
        call.resolve(res)
    }

    companion object {
        fun checkUnmeteredWifi(context: Context): Boolean {
            val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
                ?: return false
            val network = cm.activeNetwork ?: return false
            val caps = cm.getNetworkCapabilities(network) ?: return false
            return caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) &&
                caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED)
        }

        fun sha256Hex(bytes: ByteArray): String {
            val digest = MessageDigest.getInstance("SHA-256").digest(bytes)
            return digest.joinToString("") { "%02x".format(it) }
        }
    }
}

class SmartBackupWorker(
    appContext: Context,
    params: WorkerParameters
) : Worker(appContext, params) {
    override fun doWork(): ListenableWorker.Result {
        if (!SmartBackupPlugin.checkUnmeteredWifi(applicationContext)) {
            return ListenableWorker.Result.retry()
        }
        return ListenableWorker.Result.success()
    }
}

