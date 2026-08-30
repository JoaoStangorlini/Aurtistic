package com.stangorlini.web

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.util.Log
import android.widget.RemoteViews
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale

class GlobalWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        try {
            for (appWidgetId in appWidgetIds) {
                updateAppWidget(context, appWidgetManager, appWidgetId)
            }
        } catch (e: Throwable) {
            Log.e("GlobalWidgetProvider", "Error in onUpdate", e)
        }
    }

    override fun onReceive(context: Context, intent: Intent) {
        try {
            super.onReceive(context, intent)
            val action = intent.action
            val prefs = context.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE)

            if (action == "ACTION_GLOBAL_PREV_MONTH" || action == "ACTION_GLOBAL_NEXT_MONTH") {
                var offset = prefs.getInt("global_month_offset", 0)
                if (action == "ACTION_GLOBAL_PREV_MONTH") offset-- else offset++
                prefs.edit().putInt("global_month_offset", offset)
                    .putInt("calendar_widget_month_offset", offset).apply()
                refreshAll(context)
            }

            if (action == "ACTION_GLOBAL_PREV_WEEK" || action == "ACTION_GLOBAL_NEXT_WEEK") {
                var offset = prefs.getInt("global_week_offset", 0)
                if (action == "ACTION_GLOBAL_PREV_WEEK") offset-- else offset++
                prefs.edit().putInt("global_week_offset", offset).apply()
                refreshAll(context)
            }

            if (action == "ACTION_GLOBAL_TOGGLE_EVENTS") {
                val showE = prefs.getString("widget_global_show_events", "true") == "true"
                prefs.edit().putString("widget_global_show_events", (!showE).toString()).apply()
                refreshAll(context)
            }

            if (action == "ACTION_GLOBAL_TOGGLE_TASKS") {
                val showT = prefs.getString("widget_global_show_tasks", "true") == "true"
                prefs.edit().putString("widget_global_show_tasks", (!showT).toString()).apply()
                refreshAll(context)
            }
        } catch (e: Throwable) {
            Log.e("GlobalWidgetProvider", "Error in onReceive", e)
        }
    }

    private fun refreshAll(context: Context) {
        try {
            val appWidgetManager = AppWidgetManager.getInstance(context)
            val appWidgetIds = appWidgetManager.getAppWidgetIds(ComponentName(context, GlobalWidgetProvider::class.java))
            onUpdate(context, appWidgetManager, appWidgetIds)
            appWidgetManager.notifyAppWidgetViewDataChanged(appWidgetIds, R.id.global_list_view)
        } catch (e: Throwable) {
            Log.e("GlobalWidgetProvider", "Error in refreshAll", e)
        }
    }

    companion object {
        fun updateAppWidget(context: Context, appWidgetManager: AppWidgetManager, appWidgetId: Int) {
            try {
                val views = RemoteViews(context.packageName, R.layout.widget_global)
                val prefs = context.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE)

                val showTasks = prefs.getString("widget_global_show_tasks", "true") == "true"
                val showEvents = prefs.getString("widget_global_show_events", "true") == "true"
                val selectedDim = prefs.getString("widget_filter_dimension", "") ?: ""
                val titleText = if (selectedDim.isEmpty() || selectedDim.equals("Todas", ignoreCase = true)) "Dimensões" else selectedDim
                views.setTextViewText(R.id.global_list_title, titleText)

                // Setup Adapter for Top-Right ListView with unique data URI and widget_type
                val serviceIntent = Intent(context, EventsWidgetService::class.java).apply {
                    putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId)
                    putExtra("widget_type", "global")
                    data = Uri.parse("content://aurtistic/widget/global/$appWidgetId/${System.currentTimeMillis()}")
                }
                views.setRemoteAdapter(R.id.global_list_view, serviceIntent)
                views.setEmptyView(R.id.global_list_view, R.id.global_empty_list_view)

                // Template for list clicks (Fill-in intent)
                val itemClickIntent = Intent(context, WidgetActionActivity::class.java).apply {
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
                }
                val itemClickPendingIntent = PendingIntent.getActivity(
                    context, 105, itemClickIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
                )
                views.setPendingIntentTemplate(R.id.global_list_view, itemClickPendingIntent)

                // Dimension Filter Dialog on click
                val dimIntent = Intent(context, WidgetActionActivity::class.java).apply {
                    putExtra("action", "change_dimension")
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
                }
                val dimPendingIntent = PendingIntent.getActivity(context, 100, dimIntent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
                views.setOnClickPendingIntent(R.id.global_title_container, dimPendingIntent)
                views.setOnClickPendingIntent(R.id.global_list_title, dimPendingIntent)

                val addIntent = Intent(context, WidgetActionActivity::class.java).apply {
                    putExtra("action", "create_event")
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
                }
                val addPendingIntent = PendingIntent.getActivity(context, 101, addIntent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
                views.setOnClickPendingIntent(R.id.global_btn_add_event, addPendingIntent)

                val toggleE = PendingIntent.getBroadcast(context, 106, Intent(context, GlobalWidgetProvider::class.java).apply { action = "ACTION_GLOBAL_TOGGLE_EVENTS" }, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
                val toggleT = PendingIntent.getBroadcast(context, 107, Intent(context, GlobalWidgetProvider::class.java).apply { action = "ACTION_GLOBAL_TOGGLE_TASKS" }, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
                views.setOnClickPendingIntent(R.id.global_btn_toggle_events, toggleE)
                views.setOnClickPendingIntent(R.id.global_btn_toggle_tasks, toggleT)

                views.setInt(R.id.global_btn_toggle_events, "setBackgroundResource", if (showEvents) R.drawable.bg_event_pill_default else R.drawable.bg_event_pill_disabled)
                views.setInt(R.id.global_btn_toggle_tasks, "setBackgroundResource", if (showTasks) R.drawable.bg_task_pill_default else R.drawable.bg_task_pill_disabled)

                // POPULATE MONTH CALENDAR (Top Left)
                val monthOffset = prefs.getInt("global_month_offset", 0)
                val mCal = Calendar.getInstance()
                mCal.add(Calendar.MONTH, monthOffset)
                
                val realCal = Calendar.getInstance()
                val isCurrentMonth = (mCal.get(Calendar.YEAR) == realCal.get(Calendar.YEAR) && mCal.get(Calendar.MONTH) == realCal.get(Calendar.MONTH))
                val todayDay = realCal.get(Calendar.DAY_OF_MONTH)
                
                val monthFormat = SimpleDateFormat("MMMM yyyy", Locale("pt", "BR"))
                val monthTitle = monthFormat.format(mCal.time).replaceFirstChar { it.uppercase() }
                views.setTextViewText(R.id.global_month_title, monthTitle)

                // Month click opens Month Dialog
                val monthIntent = Intent(context, WidgetActionActivity::class.java).apply {
                    putExtra("action", "change_month")
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
                }
                val monthPendingIntent = PendingIntent.getActivity(context, 110, monthIntent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
                views.setOnClickPendingIntent(R.id.global_month_title_container, monthPendingIntent)
                views.setOnClickPendingIntent(R.id.global_month_title, monthPendingIntent)

                views.removeAllViews(R.id.global_month_grid_container)
                val monthCal = mCal.clone() as Calendar
                monthCal.set(Calendar.DAY_OF_MONTH, 1)
                val firstDayOffset = monthCal.get(Calendar.DAY_OF_WEEK) - Calendar.SUNDAY
                val maxDaysInMonth = monthCal.getActualMaximum(Calendar.DAY_OF_MONTH)
                
                var dayCounter = 1 - firstDayOffset
                for (row in 0..5) {
                    if (dayCounter > maxDaysInMonth) break
                    val rowViews = RemoteViews(context.packageName, R.layout.item_weekly_calendar_row)
                    for (col in 0..6) {
                        val dayCell = RemoteViews(context.packageName, R.layout.item_mini_month_day)
                        if (dayCounter in 1..maxDaysInMonth) {
                            dayCell.setTextViewText(R.id.mini_day_text, dayCounter.toString())
                            if (isCurrentMonth && dayCounter == todayDay) {
                                dayCell.setTextColor(R.id.mini_day_text, android.graphics.Color.parseColor("#9D4EDD"))
                            }
                        } else {
                            dayCell.setTextViewText(R.id.mini_day_text, "")
                        }
                        rowViews.addView(R.id.row_container, dayCell)
                        dayCounter++
                    }
                    views.addView(R.id.global_month_grid_container, rowViews)
                }

                // Week navigation pending intents (Left / Right buttons)
                val prevWeekPending = PendingIntent.getBroadcast(
                    context, 120,
                    Intent(context, GlobalWidgetProvider::class.java).apply { action = "ACTION_GLOBAL_PREV_WEEK" },
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                )
                views.setOnClickPendingIntent(R.id.global_btn_prev_week, prevWeekPending)

                val nextWeekPending = PendingIntent.getBroadcast(
                    context, 121,
                    Intent(context, GlobalWidgetProvider::class.java).apply { action = "ACTION_GLOBAL_NEXT_WEEK" },
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                )
                views.setOnClickPendingIntent(R.id.global_btn_next_week, nextWeekPending)

                // POPULATE WEEKLY CALENDAR (Bottom) - EXACTLY 1 WEEK (7 days: 0..6)
                val weekOffset = prefs.getInt("global_week_offset", 0)
                val wCal = Calendar.getInstance()
                wCal.firstDayOfWeek = Calendar.SUNDAY
                wCal.set(Calendar.DAY_OF_WEEK, Calendar.SUNDAY)
                wCal.add(Calendar.WEEK_OF_YEAR, weekOffset)

                views.removeAllViews(R.id.global_weekly_grid_container)
                val splitType = prefs.getString("widget_weekly_split_type", "12h") ?: "12h"

                val todayDayOfYear = realCal.get(Calendar.DAY_OF_YEAR)
                val todayYear = realCal.get(Calendar.YEAR)

                fun matchesDim(itemDim: String, filter: String, isFav: Boolean): Boolean {
                    if (filter.isEmpty() || filter.equals("Todas", ignoreCase = true)) return true
                    if (filter.equals("Favoritas", ignoreCase = true)) return isFav
                    val cItem = itemDim.trim().lowercase()
                    val cFilter = filter.trim().lowercase()
                    return cItem == cFilter || cItem.contains(cFilter) || cFilter.contains(cItem)
                }

                // Load Events
                val events = mutableListOf<JSONObject>()
                if (showEvents) {
                    val eventsJson = prefs.getString("user_events", "[]")
                    try {
                        val arr = JSONArray(eventsJson)
                        for (i in 0 until arr.length()) {
                            val ev = arr.getJSONObject(i)
                            if (matchesDim(ev.optString("dimensao", ""), selectedDim, ev.optBoolean("is_favorite", false))) {
                                events.add(ev)
                            }
                        }
                    } catch (e: Exception) {}
                }

                // Load Tasks
                val tasks = mutableListOf<JSONObject>()
                if (showTasks) {
                    val tasksJson = prefs.getString("favorite_tasks", "[]")
                    try {
                        val arr = JSONArray(tasksJson)
                        for (i in 0 until arr.length()) {
                            val tk = arr.getJSONObject(i)
                            if (matchesDim(tk.optString("dimensao", ""), selectedDim, tk.optBoolean("is_favorite", false))) {
                                tasks.add(tk)
                            }
                        }
                    } catch (e: Exception) {}
                }

                for (dayIndex in 0..6) {
                    val dayOfWeek = dayIndex % 7
                    val cellLayout = when (splitType) {
                        "8h" -> R.layout.item_weekly_calendar_cell_8h
                        "12h" -> R.layout.item_weekly_calendar_cell
                        else -> R.layout.item_calendar_cell
                    }
                    val cellViews = RemoteViews(context.packageName, cellLayout)
                    val dayNum = wCal.get(Calendar.DAY_OF_MONTH)
                    val currentYear = wCal.get(Calendar.YEAR)
                    val currentDayOfYear = wCal.get(Calendar.DAY_OF_YEAR)
                    val daysOfWeekShort = arrayOf("D", "S", "T", "Q", "Q", "S", "S")

                    cellViews.setTextViewText(R.id.cell_day_of_week_text, daysOfWeekShort[dayOfWeek])
                    cellViews.setTextViewText(R.id.cell_day_text, dayNum.toString())
                    
                    if (currentYear == todayYear && currentDayOfYear == todayDayOfYear) {
                        cellViews.setTextColor(R.id.cell_day_text, android.graphics.Color.parseColor("#9D4EDD"))
                    }

                    val dayStr = String.format("%04d-%02d-%02d", wCal.get(Calendar.YEAR), wCal.get(Calendar.MONTH) + 1, dayNum)
                    
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
                    
                    views.addView(R.id.global_weekly_grid_container, cellViews)
                    wCal.add(Calendar.DAY_OF_MONTH, 1)
                }

                appWidgetManager.updateAppWidget(appWidgetId, views)
                appWidgetManager.notifyAppWidgetViewDataChanged(appWidgetId, R.id.global_list_view)
            } catch (e: Throwable) {
                Log.e("GlobalWidgetProvider", "Error in updateAppWidget", e)
            }
        }
    }
}
