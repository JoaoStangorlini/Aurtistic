package com.stangorlini.web

import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import android.widget.RemoteViewsService
import org.json.JSONArray

class EventsWidgetService : RemoteViewsService() {
    override fun onGetViewFactory(intent: Intent): RemoteViewsFactory {
        return EventsWidgetFactory(this.applicationContext)
    }
}

class EventsWidgetFactory(private val context: Context) : RemoteViewsService.RemoteViewsFactory {
    private var eventsArray = JSONArray()

    override fun onCreate() {
        loadData()
    }

    override fun onDataSetChanged() {
        loadData()
    }

    private fun loadData() {
        val prefs = context.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE)
        val eventsJson = prefs.getString("user_events", "[]")
        try {
            eventsArray = JSONArray(eventsJson)
        } catch (e: Exception) {
            e.printStackTrace()
            eventsArray = JSONArray()
        }
    }

    override fun onDestroy() {}
    override fun getCount(): Int = eventsArray.length()

    override fun getViewAt(position: Int): RemoteViews {
        val views = RemoteViews(context.packageName, R.layout.widget_events_item)
        try {
            val event = eventsArray.getJSONObject(position)
            val title = event.optString("nome", event.optString("titulo", "Evento"))
            val dataInicio = event.optString("data_inicio", "")
            val dataFim = event.optString("data_fim", "")

            views.setTextViewText(R.id.event_title, title)
            
            var timeText = "Dia inteiro"
            if (dataInicio.isNotEmpty()) {
                val cleanStart = dataInicio.replace("Z", "")
                if (cleanStart.contains("T")) {
                    val parts = cleanStart.split("T")
                    val dateParts = parts[0].split("-")
                    val timeParts = parts[1].split(":")
                    if (dateParts.size >= 3 && timeParts.size >= 2) {
                        val formattedDate = "${dateParts[2]}/${dateParts[1]}"
                        val formattedTime = "${timeParts[0]}:${timeParts[1]}"
                        timeText = "$formattedDate às $formattedTime"
                    }
                } else if (cleanStart.contains("-")) {
                    val dateParts = cleanStart.split("-")
                    if (dateParts.size >= 3) {
                        timeText = "${dateParts[2]}/${dateParts[1]}"
                    }
                }
            }
            
            views.setTextViewText(R.id.event_time, timeText)

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
