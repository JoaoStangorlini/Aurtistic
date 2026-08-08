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

class WeeklyCalendarWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        for (appWidgetId in appWidgetIds) {
            updateAppWidget(context, appWidgetManager, appWidgetId)
        }
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        val action = intent.action
        
        if (action == "ACTION_PREV_WEEK" || action == "ACTION_NEXT_WEEK") {
            val prefs = context.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE)
            var offset = prefs.getInt("weekly_calendar_widget_week_offset", 0)
            if (action == "ACTION_PREV_WEEK") offset-- else offset++
            prefs.edit().putInt("weekly_calendar_widget_week_offset", offset).apply()
            
            val appWidgetManager = AppWidgetManager.getInstance(context)
            val appWidgetIds = appWidgetManager.getAppWidgetIds(ComponentName(context, WeeklyCalendarWidgetProvider::class.java))
            onUpdate(context, appWidgetManager, appWidgetIds)
        }
        
        if (action == "ACTION_TOGGLE_EVENTS") {
            val prefs = context.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE)
            val showE = prefs.getString("widget_weekly_show_events", "true") == "true"
            prefs.edit().putString("widget_weekly_show_events", (!showE).toString()).apply()
            
            val appWidgetManager = AppWidgetManager.getInstance(context)
            val appWidgetIds = appWidgetManager.getAppWidgetIds(ComponentName(context, WeeklyCalendarWidgetProvider::class.java))
            onUpdate(context, appWidgetManager, appWidgetIds)
        }
        
        if (action == "ACTION_TOGGLE_TASKS") {
            val prefs = context.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE)
            val showT = prefs.getString("widget_weekly_show_tasks", "true") == "true"
            prefs.edit().putString("widget_weekly_show_tasks", (!showT).toString()).apply()
            
            val appWidgetManager = AppWidgetManager.getInstance(context)
            val appWidgetIds = appWidgetManager.getAppWidgetIds(ComponentName(context, WeeklyCalendarWidgetProvider::class.java))
            onUpdate(context, appWidgetManager, appWidgetIds)
        }
    }

    companion object {
        fun updateAppWidget(context: Context, appWidgetManager: AppWidgetManager, appWidgetId: Int) {
            val views = RemoteViews(context.packageName, R.layout.widget_weekly_calendar)
            val prefs = context.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE)
            val weekOffset = prefs.getInt("weekly_calendar_widget_week_offset", 0)

            val cal = Calendar.getInstance()
            // Set to beginning of the week (Sunday)
            cal.firstDayOfWeek = Calendar.SUNDAY
            cal.set(Calendar.DAY_OF_WEEK, Calendar.SUNDAY)
            cal.add(Calendar.WEEK_OF_YEAR, weekOffset)
            
            val realCal = Calendar.getInstance()
            val todayDay = realCal.get(Calendar.DAY_OF_YEAR)
            val todayYear = realCal.get(Calendar.YEAR)
            
            val monthFormat = SimpleDateFormat("MMMM yyyy", Locale("pt", "BR"))
            // We use the month of the Wednesday of this week to represent the week's month
            val midWeekCal = cal.clone() as Calendar
            midWeekCal.add(Calendar.DAY_OF_WEEK, 3)
            val monthTitle = monthFormat.format(midWeekCal.time).replaceFirstChar { if (it.isLowerCase()) it.titlecase(Locale.getDefault()) else it.toString() }



            val addIntent = Intent(context, WidgetActionActivity::class.java).apply {
                putExtra("action", "create_event")
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
            }
            val pendingAdd = PendingIntent.getActivity(context, 2, addIntent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            views.setOnClickPendingIntent(R.id.btn_add_event, pendingAdd)

            val showTasks = prefs.getString("widget_weekly_show_tasks", "true") == "true"
            val showEvents = prefs.getString("widget_weekly_show_events", "true") == "true"
            
            val splitType = prefs.getString("widget_weekly_split_type", null) ?: if (prefs.getString("widget_weekly_split_shifts", "true") == "true") "12h" else "none"

            val toggleEventsIntent = Intent(context, WeeklyCalendarWidgetProvider::class.java).apply { action = "ACTION_TOGGLE_EVENTS" }
            val pendingToggleEvents = PendingIntent.getBroadcast(context, 3, toggleEventsIntent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            views.setOnClickPendingIntent(R.id.btn_toggle_events, pendingToggleEvents)
            if (showEvents) {
                views.setInt(R.id.btn_toggle_events, "setBackgroundResource", R.drawable.bg_event_pill_default)
            } else {
                views.setInt(R.id.btn_toggle_events, "setBackgroundResource", R.drawable.bg_event_pill_disabled)
            }

            val toggleTasksIntent = Intent(context, WeeklyCalendarWidgetProvider::class.java).apply { action = "ACTION_TOGGLE_TASKS" }
            val pendingToggleTasks = PendingIntent.getBroadcast(context, 4, toggleTasksIntent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            views.setOnClickPendingIntent(R.id.btn_toggle_tasks, pendingToggleTasks)
            if (showTasks) {
                views.setInt(R.id.btn_toggle_tasks, "setBackgroundResource", R.drawable.bg_task_pill_default)
            } else {
                views.setInt(R.id.btn_toggle_tasks, "setBackgroundResource", R.drawable.bg_task_pill_disabled)
            }

            // Load Events
            val events = mutableListOf<JSONObject>()
            if (showEvents) {
                val eventsJson = prefs.getString("user_events", "[]")
                try {
                    val arr = JSONArray(eventsJson)
                    for (i in 0 until arr.length()) {
                        events.add(arr.getJSONObject(i))
                    }
                } catch (e: Exception) { e.printStackTrace() }
            }

            // Load Tasks
            val tasks = mutableListOf<JSONObject>()
            if (showTasks) {
                val tasksJson = prefs.getString("favorite_tasks", "[]")
                try {
                    val arr = JSONArray(tasksJson)
                    for (i in 0 until arr.length()) {
                        tasks.add(arr.getJSONObject(i))
                    }
                } catch (e: Exception) { e.printStackTrace() }
            }

            // Clear Grid Container
            views.removeAllViews(R.id.calendar_grid_container)

            for (dayIndex in 0..13) {
                val dayOfWeek = dayIndex % 7
                val cellLayout = when (splitType) {
                    "8h" -> R.layout.item_weekly_calendar_cell_8h
                    "12h" -> R.layout.item_weekly_calendar_cell
                    else -> R.layout.item_calendar_cell
                }
                val cellViews = RemoteViews(context.packageName, cellLayout)
                
                val currentDayOfMonth = cal.get(Calendar.DAY_OF_MONTH)
                val currentYear = cal.get(Calendar.YEAR)
                val currentDayOfYear = cal.get(Calendar.DAY_OF_YEAR)
                
                val daysOfWeekShort = arrayOf("D", "S", "T", "Q", "Q", "S", "S")
                cellViews.setTextViewText(R.id.cell_day_of_week_text, daysOfWeekShort[dayOfWeek])
                cellViews.setTextViewText(R.id.cell_day_text, currentDayOfMonth.toString())
                
                if (currentYear == todayYear && currentDayOfYear == todayDay) {
                    cellViews.setTextColor(R.id.cell_day_text, android.graphics.Color.parseColor("#9D4EDD"))
                }
                
                val dayStr = String.format("%04d-%02d-%02d", cal.get(Calendar.YEAR), cal.get(Calendar.MONTH) + 1, currentDayOfMonth)
                
                val itemsShift1 = mutableListOf<RemoteViews>()
                val itemsShift2 = mutableListOf<RemoteViews>()
                val itemsShift3 = mutableListOf<RemoteViews>()
                val itemsWithoutTime = mutableListOf<RemoteViews>()
                
                fun getHour(dateStr: String): Int? {
                    val parts = dateStr.split("T")
                    if (parts.size > 1) {
                        return parts[1].split(":")[0].toIntOrNull()
                    }
                    return null
                }
                
                fun categorizeItem(hour: Int?, view: RemoteViews) {
                    if (hour != null) {
                        if (splitType == "8h") {
                            when {
                                hour < 8 -> itemsShift1.add(view)
                                hour < 16 -> itemsShift2.add(view)
                                else -> itemsShift3.add(view)
                            }
                        } else {
                            if (hour < 12) itemsShift1.add(view)
                            else itemsShift2.add(view)
                        }
                    } else {
                        itemsWithoutTime.add(view)
                    }
                }
                
                for (ev in events) {
                    val dataInicio = ev.optString("data_inicio", "")
                    if (dataInicio.contains(dayStr)) {
                        val hour = getHour(dataInicio)
                        val pillViews = RemoteViews(context.packageName, R.layout.item_calendar_event_pill)
                        pillViews.setTextViewText(R.id.event_pill_text, ev.optString("nome", "Evento"))
                        categorizeItem(hour, pillViews)
                    }
                }

                for (tk in tasks) {
                    val prazo = tk.optString("prazo", "")
                    if (prazo.contains(dayStr)) {
                        val hour = getHour(prazo)
                        val pillViews = RemoteViews(context.packageName, R.layout.item_calendar_task_pill)
                        pillViews.setTextViewText(R.id.task_pill_text, tk.optString("nome", "Tarefa"))
                        categorizeItem(hour, pillViews)
                    }
                }

                if (splitType == "8h") {
                    var s1Count = 0; var s2Count = 0; var s3Count = 0
                    for (v in itemsShift1) if (s1Count < 1) { cellViews.addView(R.id.cell_events_shift1, v); s1Count++ }
                    for (v in itemsShift2) if (s2Count < 1) { cellViews.addView(R.id.cell_events_shift2, v); s2Count++ }
                    for (v in itemsShift3) if (s3Count < 1) { cellViews.addView(R.id.cell_events_shift3, v); s3Count++ }
                } else if (splitType == "12h") {
                    var amCount = 0
                    var pmCount = 0
                    for (v in itemsShift1) if (amCount < 2) { cellViews.addView(R.id.cell_events_am, v); amCount++ }
                    for (v in itemsShift2) if (pmCount < 2) { cellViews.addView(R.id.cell_events_pm, v); pmCount++ }
                } else {
                    var count = 0
                    val allItems = itemsShift1 + itemsShift2 + itemsShift3 + itemsWithoutTime
                    for (v in allItems) {
                        if (count < 3) {
                            cellViews.addView(R.id.cell_events_container, v)
                            count++
                        }
                    }
                }

                views.addView(R.id.calendar_grid_container, cellViews)

                // Add purple divider after day 6 (end of week 1)
                if (dayOfWeek == 6 && dayIndex < 13) {
                    val dividerView = RemoteViews(context.packageName, R.layout.item_week_divider)
                    views.addView(R.id.calendar_grid_container, dividerView)
                }

                cal.add(Calendar.DAY_OF_MONTH, 1)
            }

            appWidgetManager.updateAppWidget(appWidgetId, views)
        }
    }
}
