package com.stangorlini.web

import android.app.Activity
import android.app.AlertDialog
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Bundle
import org.json.JSONArray
import org.json.JSONObject

class WidgetActionActivity : Activity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        val action = intent.getStringExtra("action")
        val taskId = intent.getStringExtra("taskId")
        
        if (action == "change_status" && taskId != null) {
            showStatusDialog(taskId)
        } else if (action == "change_dimension") {
            showDimensionDialog()
        } else if (action == "create_task") {
            showCreateTaskDialog()
        } else if (action == "open_task" && taskId != null) {
            val prefs = getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE)
            prefs.edit().putString("widget_action_open_task", taskId).commit()
            launchMainActivity()
            finish()
        } else {
            finish()
        }
    }

    private fun showStatusDialog(taskId: String) {
        val statuses = arrayOf("Não Iniciada", "Em Progresso", "Atrasada", "Completa", "Descartada")
        val internalStatuses = arrayOf("nao_iniciada", "em_progresso", "atrasada", "completa", "descartada")
        
        val dialogView = layoutInflater.inflate(R.layout.dialog_custom_menu, null)
        val titleView = dialogView.findViewById<android.widget.TextView>(R.id.dialog_title)
        val container = dialogView.findViewById<android.widget.LinearLayout>(R.id.dialog_items_container)
        titleView.text = "Alterar Status"

        val dialog = android.app.Dialog(this)
        dialog.requestWindowFeature(android.view.Window.FEATURE_NO_TITLE)
        dialog.setContentView(dialogView)
        dialog.window?.setBackgroundDrawable(android.graphics.drawable.ColorDrawable(android.graphics.Color.TRANSPARENT))
        
        statuses.forEachIndexed { index, statusName ->
            val itemView = layoutInflater.inflate(R.layout.item_dialog_option, container, false) as android.widget.TextView
            itemView.text = statusName
            itemView.setTextColor(getStatusColor(statusName))
            itemView.setOnClickListener {
                val newStatus = internalStatuses[index]
                savePendingStatusUpdate(taskId, newStatus)
                optimisticStatusUpdate(taskId, newStatus)
                launchMainActivity()
                dialog.dismiss()
                finish()
            }
            container.addView(itemView)
        }
        
        dialog.setOnCancelListener { finish() }
        dialog.show()
    }

    private fun showDimensionDialog() {
        val prefs = getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE)
        val dimsJson = prefs.getString("unique_dimensions", "[]")
        
        val dimensionsList = mutableListOf<String>()
        dimensionsList.add("Todas as Dimensões") // Default option
        
        try {
            val arr = JSONArray(dimsJson)
            for (i in 0 until arr.length()) {
                dimensionsList.add(arr.getString(i))
            }
        } catch (e: Exception) { e.printStackTrace() }
        
        val dimsArray = dimensionsList.toTypedArray()
        
        val dialogView = layoutInflater.inflate(R.layout.dialog_custom_menu, null)
        val titleView = dialogView.findViewById<android.widget.TextView>(R.id.dialog_title)
        val container = dialogView.findViewById<android.widget.LinearLayout>(R.id.dialog_items_container)
        titleView.text = "Filtrar por Dimensão"

        val dialog = android.app.Dialog(this)
        dialog.requestWindowFeature(android.view.Window.FEATURE_NO_TITLE)
        dialog.setContentView(dialogView)
        dialog.window?.setBackgroundDrawable(android.graphics.drawable.ColorDrawable(android.graphics.Color.TRANSPARENT))
        
        dimsArray.forEachIndexed { index, dimName ->
            val itemView = layoutInflater.inflate(R.layout.item_dialog_option, container, false) as android.widget.TextView
            itemView.text = dimName
            if (index == 0) {
                itemView.setTextColor(android.graphics.Color.parseColor("#E0E0E0"))
            } else {
                itemView.setTextColor(getDimensionColor(dimName))
            }
            itemView.setOnClickListener {
                val selectedDim = if (index == 0) "" else dimName
                prefs.edit().putString("widget_filter_dimension", selectedDim).apply()
                updateWidgetUI()
                dialog.dismiss()
                finish()
            }
            container.addView(itemView)
        }
        
        dialog.setOnCancelListener { finish() }
        dialog.show()
    }
    
    private fun showCreateTaskDialog() {
        val dialogView = layoutInflater.inflate(R.layout.dialog_create_task, null)
        val inputName = dialogView.findViewById<android.widget.EditText>(R.id.input_task_name)
        val btnCancel = dialogView.findViewById<android.widget.Button>(R.id.btn_cancel)
        val btnSave = dialogView.findViewById<android.widget.Button>(R.id.btn_save)

        val dialog = android.app.Dialog(this)
        dialog.requestWindowFeature(android.view.Window.FEATURE_NO_TITLE)
        dialog.setContentView(dialogView)
        dialog.window?.setBackgroundDrawable(android.graphics.drawable.ColorDrawable(android.graphics.Color.TRANSPARENT))
        
        btnCancel.setOnClickListener {
            dialog.dismiss()
            finish()
        }
        
        btnSave.setOnClickListener {
            val taskName = inputName.text.toString().trim()
            if (taskName.isNotEmpty()) {
                val tempId = java.util.UUID.randomUUID().toString()
                savePendingCreateUpdate(tempId, taskName)
                optimisticCreateUpdate(tempId, taskName)
                // We do NOT launch MainActivity. Let the user stay on home screen.
            }
            dialog.dismiss()
            finish()
        }
        
        dialog.setOnCancelListener { finish() }
        dialog.show()
        
        // Show keyboard automatically
        inputName.requestFocus()
        dialog.window?.setSoftInputMode(android.view.WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_VISIBLE)
    }

    private fun savePendingCreateUpdate(taskId: String, taskName: String) {
        val prefs = getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE)
        val pendingJson = prefs.getString("pending_widget_updates", "[]")
        try {
            val arr = JSONArray(pendingJson)
            val obj = JSONObject()
            obj.put("action", "create")
            obj.put("taskId", taskId)
            obj.put("taskName", taskName)
            arr.put(obj)
            prefs.edit().putString("pending_widget_updates", arr.toString()).apply()
        } catch (e: Exception) { e.printStackTrace() }
    }

    private fun optimisticCreateUpdate(taskId: String, taskName: String) {
        val prefs = getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE)
        val tasksJson = prefs.getString("favorite_tasks", "[]")
        try {
            val arr = JSONArray(tasksJson)
            val newTask = JSONObject()
            newTask.put("id", taskId)
            newTask.put("nome", taskName)
            newTask.put("status", "rascunho")
            newTask.put("is_favorite", true)
            // Add at the beginning
            val newArr = JSONArray()
            newArr.put(newTask)
            for (i in 0 until arr.length()) {
                newArr.put(arr.getJSONObject(i))
            }
            prefs.edit().putString("favorite_tasks", newArr.toString()).apply()
            updateWidgetUI()
        } catch (e: Exception) { e.printStackTrace() }
    }

    private fun savePendingStatusUpdate(taskId: String, newStatus: String) {
        val prefs = getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE)
        val pendingJson = prefs.getString("pending_widget_updates", "[]")
        try {
            val arr = JSONArray(pendingJson)
            val obj = JSONObject()
            obj.put("taskId", taskId)
            obj.put("status", newStatus)
            arr.put(obj)
            prefs.edit().putString("pending_widget_updates", arr.toString()).apply()
        } catch (e: Exception) { e.printStackTrace() }
    }
    
    private fun optimisticStatusUpdate(taskId: String, newStatus: String) {
        val prefs = getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE)
        val tasksJson = prefs.getString("favorite_tasks", "[]")
        try {
            val arr = JSONArray(tasksJson)
            for (i in 0 until arr.length()) {
                val task = arr.getJSONObject(i)
                if (task.optString("id") == taskId) {
                    task.put("status", newStatus)
                    break
                }
            }
            prefs.edit().putString("favorite_tasks", arr.toString()).apply()
            updateWidgetUI()
        } catch (e: Exception) { e.printStackTrace() }
    }
    
    private fun updateWidgetUI() {
        val intent = Intent(this, FavoritesWidgetProvider::class.java)
        intent.action = AppWidgetManager.ACTION_APPWIDGET_UPDATE
        
        val widgetManager = AppWidgetManager.getInstance(this)
        val ids = widgetManager.getAppWidgetIds(ComponentName(this, FavoritesWidgetProvider::class.java))
        intent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids)
        
        sendBroadcast(intent)
    }

    private fun launchMainActivity() {
        val intent = Intent(this, MainActivity::class.java)
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        startActivity(intent)
    }

    private fun getDimensionColor(dimName: String): Int {
        val text = dimName.lowercase().trim()
        val colorStr = when {
            text.contains("usp") -> "#4da8ff"
            text.contains("hub") -> "#9D4EDD"
            text.contains("urgente") -> "#F14343"
            text.contains("livros") -> "#FFCC00"
            text.contains("filmes") || text.contains("series") || text.contains("séries") -> "#FFE066"
            text.contains("tatuagens") || text.contains("tattoo") -> "#D39BFE"
            text.contains("cin") -> "#E0E0E0"
            text.contains("compras") -> "#69F0AE"
            text.contains("stangorlini") || text.contains("web") -> "#3b82f6"
            text.contains("fotografia") || text.contains("foto") -> "#ec4899"
            text.contains("hobbys") || text.contains("hobby") -> "#0f9d58"
            else -> "#FFCC00"
        }
        return android.graphics.Color.parseColor(colorStr)
    }

    private fun getStatusColor(statusName: String): Int {
        val text = statusName.lowercase().trim()
        val colorStr = when {
            text.contains("completa") -> "#0f9d58"
            text.contains("testar") -> "#f4b400"
            text.contains("descartada") -> "#db4437"
            text.contains("progresso") -> "#4285f4"
            text.contains("iniciada") -> "#E0E0E0"
            else -> "#A0A0A0"
        }
        return android.graphics.Color.parseColor(colorStr)
    }
}
