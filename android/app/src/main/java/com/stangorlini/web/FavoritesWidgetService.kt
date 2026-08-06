package com.stangorlini.web

import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import android.widget.RemoteViewsService
import org.json.JSONArray
import java.text.SimpleDateFormat
import java.util.Locale

class FavoritesWidgetService : RemoteViewsService() {
    override fun onGetViewFactory(intent: Intent): RemoteViewsFactory {
        return FavoritesWidgetFactory(this.applicationContext)
    }
}


class FavoritesWidgetFactory(private val context: Context) : RemoteViewsService.RemoteViewsFactory {
    private var tasksArray = JSONArray()
    private var statusColorsMap = org.json.JSONObject()

    private fun getStatusColor(statusName: String): Int {
        val text = statusName.lowercase().trim()
        val defaultColor = "#FFCC00"
        
        if (statusColorsMap.has(text)) {
            val c = statusColorsMap.optString(text, defaultColor)
            try { return android.graphics.Color.parseColor(c) } catch(e: Exception) {}
        }
        
        val keys = statusColorsMap.keys()
        while(keys.hasNext()) {
            val k = keys.next().lowercase()
            if (text.contains(k)) {
               val c = statusColorsMap.optString(k, defaultColor)
               try { return android.graphics.Color.parseColor(c) } catch(e: Exception) {}
            }
        }
        return android.graphics.Color.parseColor(defaultColor)
    }

    private fun getDimensionDrawables(dimensionName: String): Pair<Int, String> {
        val text = dimensionName.lowercase().trim()
        return when {
            text.contains("usp") -> Pair(R.drawable.widget_item_bg_usp, "#404DA8FF")
            text.contains("hub") -> Pair(R.drawable.widget_item_bg_hub, "#409D4EDD")
            text.contains("urgente") -> Pair(R.drawable.widget_item_bg_urgente, "#40F14343")
            text.contains("livros") -> Pair(R.drawable.widget_item_bg_livros, "#40FFCC00")
            text.contains("filmes") || text.contains("series") || text.contains("séries") -> Pair(R.drawable.widget_item_bg_filmes, "#40FFE066")
            text.contains("tatuagens") || text.contains("tattoo") -> Pair(R.drawable.widget_item_bg_tatuagens, "#40D39BFE")
            text.contains("cin") -> Pair(R.drawable.widget_item_bg_cin, "#40E0E0E0")
            text.contains("compras") -> Pair(R.drawable.widget_item_bg_compras, "#4069F0AE")
            text.contains("stangorlini") || text.contains("web") -> Pair(R.drawable.widget_item_bg_stangorlini, "#403B82F6")
            text.contains("fotografia") || text.contains("foto") -> Pair(R.drawable.widget_item_bg_fotografia, "#40EC4899")
            text.contains("hobbys") || text.contains("hobby") -> Pair(R.drawable.widget_item_bg_hobbys, "#400F9D58")
            else -> Pair(R.drawable.widget_item_bg_default, "#40FFCC00")
        }
    }

    override fun onCreate() {
        loadData()
    }

    override fun onDataSetChanged() {
        loadData()
    }

    private fun loadData() {
        val prefs = context.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE)
        val tasksJson = prefs.getString("favorite_tasks", "[]")
        val colorsJson = prefs.getString("status_colors", "{}")
        val selectedDim = prefs.getString("widget_filter_dimension", "") ?: ""
        
        val hideCompleted = prefs.getString("widget_hide_completed", "true") == "true"
        
        try {
            statusColorsMap = org.json.JSONObject(colorsJson ?: "{}")
            val allTasks = JSONArray(tasksJson)
            val filteredList = mutableListOf<org.json.JSONObject>()
            for (i in 0 until allTasks.length()) {
                val task = allTasks.getJSONObject(i)
                val statusStr = task.optString("status", "").lowercase()
                
                // 1. Filtrar concluídas/descartadas se configurado
                if (hideCompleted && (statusStr.contains("completa") || statusStr.contains("descartada"))) {
                    continue
                }

                if (selectedDim.isEmpty() || selectedDim == "Todas") {
                    filteredList.add(task)
                } else if (selectedDim == "Favoritas") {
                    if (task.optBoolean("is_favorite", false)) {
                        filteredList.add(task)
                    }
                } else {
                    if (task.optString("dimensao", "") == selectedDim) {
                        filteredList.add(task)
                    }
                }
            }
            
            // Sort by deadline (closest/overdue first)
            val sdf = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", java.util.Locale.getDefault())
            sdf.timeZone = java.util.TimeZone.getTimeZone("UTC")
            filteredList.sortWith(Comparator { t1, t2 ->
                val p1 = t1.optString("prazo", "")
                val p2 = t2.optString("prazo", "")
                
                val p1Empty = p1.isEmpty() || p1 == "null"
                val p2Empty = p2.isEmpty() || p2 == "null"
                
                if (p1Empty && p2Empty) return@Comparator 0
                if (p1Empty) return@Comparator 1
                if (p2Empty) return@Comparator -1
                
                try {
                    val d1 = sdf.parse(p1)?.time ?: Long.MAX_VALUE
                    val d2 = sdf.parse(p2)?.time ?: Long.MAX_VALUE
                    d1.compareTo(d2)
                } catch(e: Exception) {
                    0
                }
            })

            tasksArray = JSONArray()
            filteredList.forEach { tasksArray.put(it) }
        } catch (e: Exception) {
            e.printStackTrace()
            tasksArray = JSONArray()
        }
    }

    override fun onDestroy() {}
    override fun getCount(): Int = tasksArray.length()

    override fun getViewAt(position: Int): RemoteViews {
        val views = RemoteViews(context.packageName, R.layout.widget_favorites_item)
        
        try {
            val task = tasksArray.getJSONObject(position)
            val name = task.optString("nome", "Sem título")
            val prazo = task.optString("prazo", "")
            val dimensaoStr = task.optString("dimensao", "")
            
            views.setTextViewText(R.id.task_name, name)
            
            val dimProps = getDimensionDrawables(dimensaoStr)
            views.setInt(R.id.widget_item_container, "setBackgroundResource", dimProps.first)
            
            if (prazo.isNotEmpty() && prazo != "null") {
                try {
                    val sdf = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.getDefault())
                    sdf.timeZone = java.util.TimeZone.getTimeZone("UTC")
                    val date = sdf.parse(prazo)
                    if (date != null) {
                        val today = java.util.Calendar.getInstance()
                        val concluidaEmStr = task.optString("concluida_em", "")
                        val statusStr = task.optString("status", "").lowercase(Locale.getDefault())
                        if (statusStr.contains("completa") && concluidaEmStr.isNotEmpty() && concluidaEmStr != "null") {
                            try {
                                val cDate = sdf.parse(concluidaEmStr)
                                if (cDate != null) today.time = cDate
                            } catch (e: Exception) {}
                        }
                        
                        today.set(java.util.Calendar.HOUR_OF_DAY, 0)
                        today.set(java.util.Calendar.MINUTE, 0)
                        today.set(java.util.Calendar.SECOND, 0)
                        today.set(java.util.Calendar.MILLISECOND, 0)
                        
                        val target = java.util.Calendar.getInstance()
                        target.time = date
                        target.set(java.util.Calendar.HOUR_OF_DAY, 0)
                        target.set(java.util.Calendar.MINUTE, 0)
                        target.set(java.util.Calendar.SECOND, 0)
                        target.set(java.util.Calendar.MILLISECOND, 0)
                        
                        val diffMillis = target.timeInMillis - today.timeInMillis
                        val diffDays = java.util.concurrent.TimeUnit.MILLISECONDS.toDays(diffMillis)
                        
                        val dateText = when {
                            diffDays == 0L -> "Hoje"
                            else -> "${diffDays}d"
                        }
                        
                        views.setTextViewText(R.id.task_date, dateText)
                        
                        val textColor = when {
                            diffDays < 0L -> "#FF4444"
                            else -> "#FFCC00"
                        }
                        views.setTextColor(R.id.task_date, android.graphics.Color.parseColor(textColor))
                        views.setInt(R.id.task_date, "setBackgroundColor", android.graphics.Color.parseColor(dimProps.second))
                        views.setViewVisibility(R.id.task_date, android.view.View.VISIBLE)
                        
                        val status = task.optString("status", "")
                        views.setInt(R.id.task_status, "setColorFilter", getStatusColor(status))
                    }
                } catch (e: Exception) {
                    views.setTextViewText(R.id.task_date, "")
                    views.setViewVisibility(R.id.task_date, android.view.View.GONE)
                }
            } else {
                views.setTextViewText(R.id.task_date, "")
                views.setViewVisibility(R.id.task_date, android.view.View.GONE)
            }

            // Fill-in Intent for status click
            val fillInIntent = Intent().apply {
                putExtra("action", "change_status")
                putExtra("taskId", task.optString("id", ""))
            }
            views.setOnClickFillInIntent(R.id.task_status, fillInIntent)
            
            // To allow general item clicks if needed (optional)
            val fillInIntent2 = Intent().apply {
                putExtra("action", "open_task")
                putExtra("taskId", task.optString("id", ""))
            }
            views.setOnClickFillInIntent(R.id.widget_item_container, fillInIntent2)
            
        } catch (e: Exception) {
            e.printStackTrace()
        }
        
        return views
    }

    override fun getLoadingView(): RemoteViews? = null
    override fun getViewTypeCount(): Int = 1
    override fun getItemId(position: Int): Long = position.toLong()
    override fun hasStableIds(): Boolean = true
}
