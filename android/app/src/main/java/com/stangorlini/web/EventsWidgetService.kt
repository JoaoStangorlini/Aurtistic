package com.stangorlini.web

import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import android.widget.RemoteViewsService
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale
import java.util.TimeZone

class EventsWidgetService : RemoteViewsService() {
    override fun onGetViewFactory(intent: Intent): RemoteViewsFactory {
        return EventsWidgetFactory(this.applicationContext)
    }
}

class EventsWidgetFactory(private val context: Context) : RemoteViewsService.RemoteViewsFactory {
    
    data class ListItem(
        val type: Int, // 0 = Header, 1 = Event, 2 = Task
        val dateString: String = "",
        val sortTime: Long = 0,
        val obj: JSONObject? = null
    )

    private var items = mutableListOf<ListItem>()

    override fun onCreate() {
        loadData()
    }

    override fun onDataSetChanged() {
        loadData()
    }

    private fun getStatusColor(statusName: String, statusColorsMap: JSONObject): Int {
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

    private fun loadData() {
        val prefs = context.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE)
        val showTasks = prefs.getString("widget_list_show_tasks", "true") == "true"
        val showEvents = prefs.getString("widget_list_show_events", "true") == "true"
        
        val rawItems = mutableListOf<ListItem>()
        val sdf = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.getDefault())
        sdf.timeZone = TimeZone.getTimeZone("UTC")

        if (showEvents) {
            val eventsJson = prefs.getString("user_events", "[]")
            try {
                val arr = JSONArray(eventsJson)
                for (i in 0 until arr.length()) {
                    val ev = arr.getJSONObject(i)
                    val dateStr = ev.optString("data_inicio", "")
                    val time = try { sdf.parse(dateStr)?.time ?: 0 } catch(e: Exception) { 0 }
                    rawItems.add(ListItem(type = 1, sortTime = time, obj = ev))
                }
            } catch (e: Exception) {}
        }

        if (showTasks) {
            val tasksJson = prefs.getString("favorite_tasks", "[]")
            val hideCompleted = prefs.getString("widget_hide_completed", "true") == "true"
            val filterDimension = prefs.getString("widget_filter_dimension", "")
            
            try {
                val arr = JSONArray(tasksJson)
                for (i in 0 until arr.length()) {
                    val tk = arr.getJSONObject(i)
                    val statusStr = tk.optString("status", "").lowercase()
                    if (hideCompleted && (statusStr.contains("completa") || statusStr.contains("descartada"))) continue
                    
                    if (!filterDimension.isNullOrEmpty() && filterDimension != "Todas" && filterDimension != "Favoritas") {
                        if (tk.optString("dimensao", "") != filterDimension) continue
                    }
                    if (filterDimension == "Favoritas") {
                        if (!tk.optBoolean("is_favorite", false)) continue
                    }
                    
                    val dateStr = tk.optString("prazo", "")
                    val time = try { sdf.parse(dateStr)?.time ?: 0 } catch(e: Exception) { 0 }
                    rawItems.add(ListItem(type = 2, sortTime = time, obj = tk))
                }
            } catch (e: Exception) {}
        }

        rawItems.sortWith(Comparator { a, b -> a.sortTime.compareTo(b.sortTime) })

        items.clear()
        
        val dateFormat = SimpleDateFormat("EEE, d 'de' MMM.", Locale("pt", "BR"))
        var currentDateHeader = ""

        for (item in rawItems) {
            if (item.sortTime > 0) {
                val cal = Calendar.getInstance()
                cal.timeInMillis = item.sortTime
                val headerText = dateFormat.format(cal.time).replaceFirstChar { if (it.isLowerCase()) it.titlecase(Locale.getDefault()) else it.toString() }
                
                if (headerText != currentDateHeader) {
                    currentDateHeader = headerText
                    items.add(ListItem(type = 0, dateString = headerText))
                }
            } else {
                if (currentDateHeader != "Sem data") {
                    currentDateHeader = "Sem data"
                    items.add(ListItem(type = 0, dateString = currentDateHeader))
                }
            }
            items.add(item)
        }
    }

    override fun onDestroy() {}
    override fun getCount(): Int = items.size
    override fun getViewTypeCount(): Int = 3

    override fun getViewAt(position: Int): RemoteViews {
        val item = items[position]
        
        when (item.type) {
            0 -> {
                val views = RemoteViews(context.packageName, R.layout.widget_list_header)
                views.setTextViewText(R.id.header_text, item.dateString)
                return views
            }
            1 -> {
                val views = RemoteViews(context.packageName, R.layout.widget_events_item)
                val event = item.obj!!
                val title = event.optString("nome", event.optString("titulo", "Evento"))
                views.setTextViewText(R.id.event_title, title)
                
                val dataInicio = event.optString("data_inicio", "")
                var timeText = "Dia inteiro"
                if (dataInicio.contains("T")) {
                    val parts = dataInicio.replace("Z", "").split("T")
                    val timeParts = parts[1].split(":")
                    if (timeParts.size >= 2) timeText = "${timeParts[0]}:${timeParts[1]}"
                }
                views.setTextViewText(R.id.event_time, timeText)
                return views
            }
            2 -> {
                val views = RemoteViews(context.packageName, R.layout.widget_favorites_item)
                val task = item.obj!!
                val name = task.optString("nome", "Tarefa")
                val prazo = task.optString("prazo", "")
                val dimensaoStr = task.optString("dimensao", "")
                
                views.setTextViewText(R.id.task_name, name)
                
                val dimProps = getDimensionDrawables(dimensaoStr)
                views.setInt(R.id.widget_item_container, "setBackgroundResource", dimProps.first)
                
                val prefs = context.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE)
                val colorsJson = prefs.getString("status_colors", "{}")
                val statusColorsMap = org.json.JSONObject(colorsJson ?: "{}")
                val status = task.optString("status", "")
                views.setInt(R.id.task_status, "setColorFilter", getStatusColor(status, statusColorsMap))
                
                if (prazo.isNotEmpty() && prazo != "null") {
                    try {
                        val sdf = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.getDefault())
                        sdf.timeZone = TimeZone.getTimeZone("UTC")
                        val date = sdf.parse(prazo)
                        if (date != null) {
                            val today = Calendar.getInstance()
                            val concluidaEmStr = task.optString("concluida_em", "")
                            val statusStr = task.optString("status", "").lowercase(Locale.getDefault())
                            if (statusStr.contains("completa") && concluidaEmStr.isNotEmpty() && concluidaEmStr != "null") {
                                try {
                                    val cDate = sdf.parse(concluidaEmStr)
                                    if (cDate != null) today.time = cDate
                                } catch (e: Exception) {}
                            }
                            
                            today.set(Calendar.HOUR_OF_DAY, 0)
                            today.set(Calendar.MINUTE, 0)
                            today.set(Calendar.SECOND, 0)
                            today.set(Calendar.MILLISECOND, 0)
                            
                            val target = Calendar.getInstance()
                            target.time = date
                            target.set(Calendar.HOUR_OF_DAY, 0)
                            target.set(Calendar.MINUTE, 0)
                            target.set(Calendar.SECOND, 0)
                            target.set(Calendar.MILLISECOND, 0)
                            
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
                        }
                    } catch (e: Exception) {
                        views.setViewVisibility(R.id.task_date, android.view.View.GONE)
                    }
                } else {
                    views.setViewVisibility(R.id.task_date, android.view.View.GONE)
                }

                val fillInIntent = Intent().apply {
                    putExtra("action", "change_status")
                    putExtra("taskId", task.optString("id", ""))
                }
                views.setOnClickFillInIntent(R.id.task_status, fillInIntent)
                return views
            }
        }
        return RemoteViews(context.packageName, R.layout.widget_events_item)
    }

    override fun getLoadingView(): RemoteViews? = null
    override fun getItemId(position: Int): Long = position.toLong()
    override fun hasStableIds(): Boolean = true
}
