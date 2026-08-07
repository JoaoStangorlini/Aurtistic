
package com.stangorlini.web

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale

class CalendarWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        for (appWidgetId in appWidgetIds) {
            updateAppWidget(context, appWidgetManager, appWidgetId)
        }
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        val action = intent.action
        
        if (action == "ACTION_PREV_MONTH" || action == "ACTION_NEXT_MONTH") {
            val prefs = context.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE)
            var offset = prefs.getInt("calendar_widget_month_offset", 0)
            if (action == "ACTION_PREV_MONTH") offset-- else offset++
            prefs.edit().putInt("calendar_widget_month_offset", offset).apply()
            
            val appWidgetManager = AppWidgetManager.getInstance(context)
            val appWidgetIds = appWidgetManager.getAppWidgetIds(ComponentName(context, CalendarWidgetProvider::class.java))
            onUpdate(context, appWidgetManager, appWidgetIds)
        }
    }

    companion object {
        fun updateAppWidget(context: Context, appWidgetManager: AppWidgetManager, appWidgetId: Int) {
            val views = RemoteViews(context.packageName, R.layout.widget_calendar)
            val prefs = context.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE)
            val monthOffset = prefs.getInt("calendar_widget_month_offset", 0)

            val cal = Calendar.getInstance()
            cal.add(Calendar.MONTH, monthOffset)
            
            val realCal = Calendar.getInstance()
            val isCurrentMonth = (cal.get(Calendar.YEAR) == realCal.get(Calendar.YEAR) && cal.get(Calendar.MONTH) == realCal.get(Calendar.MONTH))
            
            val monthFormat = SimpleDateFormat("MMMM yyyy", Locale("pt", "BR"))
            val monthTitle = monthFormat.format(cal.time).replaceFirstChar { if (it.isLowerCase()) it.titlecase(Locale.getDefault()) else it.toString() }

            views.setTextViewText(R.id.calendar_month_title, monthTitle)

            // Setup Intents for Navigation
            val prevIntent = Intent(context, CalendarWidgetProvider::class.java).apply { action = "ACTION_PREV_MONTH" }
            val nextIntent = Intent(context, CalendarWidgetProvider::class.java).apply { action = "ACTION_NEXT_MONTH" }
            val pendingPrev = PendingIntent.getBroadcast(context, 0, prevIntent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            val pendingNext = PendingIntent.getBroadcast(context, 1, nextIntent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            
            views.setOnClickPendingIntent(R.id.btn_prev_month, pendingPrev)
            views.setOnClickPendingIntent(R.id.btn_next_month, pendingNext)

            val addIntent = Intent(context, WidgetActionActivity::class.java).apply {
                putExtra("action", "create_event")
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
            }
            val pendingAdd = PendingIntent.getActivity(context, 2, addIntent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            views.setOnClickPendingIntent(R.id.btn_add_event, pendingAdd)

            // Load Events
            val eventsJson = prefs.getString("user_events", "[]")
            val events = mutableListOf<JSONObject>()
            try {
                val arr = JSONArray(eventsJson)
                for (i in 0 until arr.length()) {
                    events.add(arr.getJSONObject(i))
                }
            } catch (e: Exception) { e.printStackTrace() }

            // Clear Grid Container
            views.removeAllViews(R.id.calendar_grid_container)

            val daysInMonth = cal.getActualMaximum(Calendar.DAY_OF_MONTH)
            val todayDay = realCal.get(Calendar.DAY_OF_MONTH)

            val firstDayCal = cal.clone() as Calendar
            firstDayCal.set(Calendar.DAY_OF_MONTH, 1)
            val startDayOfWeek = firstDayCal.get(Calendar.DAY_OF_WEEK) - 1 // 0 for Sun

            var currentDay = 1

            for (week in 0..5) {
                if (currentDay > daysInMonth) break
                val rowViews = RemoteViews(context.packageName, R.layout.item_calendar_row)
                
                for (dayOfWeek in 0..6) {
                    val cellViews = RemoteViews(context.packageName, R.layout.item_calendar_cell)
                    
                    if ((week == 0 && dayOfWeek < startDayOfWeek) || currentDay > daysInMonth) {
                        cellViews.setTextViewText(R.id.cell_day_text, "")
                    } else {
                        cellViews.setTextViewText(R.id.cell_day_text, currentDay.toString())
                        
                        if (isCurrentMonth && currentDay == todayDay) {
                            // Highlighting today by changing background (since it's a shape drawable id, we can't easily change it via setInt for backgroundResource in some Android versions, but setting backgroundResource is safe)
                            // We created bg_calendar_cell_today
                            // Instead of changing background which requires API 16 setInt, we can just change text color for safety, or try layout swapping.
                            // But Android 4.1+ supports setInt(..., "setBackgroundResource", ...)
                            cellViews.setTextColor(R.id.cell_day_text, android.graphics.Color.parseColor("#9D4EDD"))
                        }
                        
                        // Check for events today
                        val dayStr = String.format("%04d-%02d-%02d", cal.get(Calendar.YEAR), cal.get(Calendar.MONTH) + 1, currentDay)
                        var eventCount = 0
                        for (ev in events) {
                            val dataInicio = ev.optString("data_inicio", "")
                            if (dataInicio.contains(dayStr)) {
                                if (eventCount < 3) {
                                    val pillViews = RemoteViews(context.packageName, R.layout.item_calendar_event_pill)
                                    pillViews.setTextViewText(R.id.event_pill_text, ev.optString("nome", "Evento"))
                                    // Could set custom color here based on dimension, but default is purple
                                    cellViews.addView(R.id.cell_events_container, pillViews)
                                    eventCount++
                                }
                            }
                        }

                        currentDay++
                    }
                    rowViews.addView(R.id.row_container, cellViews)
                }
                views.addView(R.id.calendar_grid_container, rowViews)
            }

            appWidgetManager.updateAppWidget(appWidgetId, views)
        }
    }
}
