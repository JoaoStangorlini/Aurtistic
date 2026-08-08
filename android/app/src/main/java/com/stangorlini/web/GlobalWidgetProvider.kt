package com.stangorlini.web

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.RemoteViews
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale

class GlobalWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        for (appWidgetId in appWidgetIds) {
            updateAppWidget(context, appWidgetManager, appWidgetId)
        }
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        val action = intent.action
        val prefs = context.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE)

        if (action == "ACTION_GLOBAL_PREV_MONTH" || action == "ACTION_GLOBAL_NEXT_MONTH") {
            var offset = prefs.getInt("global_month_offset", 0)
            if (action == "ACTION_GLOBAL_PREV_MONTH") offset-- else offset++
            prefs.edit().putInt("global_month_offset", offset).apply()
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
    }

    private fun refreshAll(context: Context) {
        val appWidgetManager = AppWidgetManager.getInstance(context)
        val appWidgetIds = appWidgetManager.getAppWidgetIds(ComponentName(context, GlobalWidgetProvider::class.java))
        onUpdate(context, appWidgetManager, appWidgetIds)
        appWidgetManager.notifyAppWidgetViewDataChanged(appWidgetIds, R.id.global_list_view)
    }

    companion object {
        fun updateAppWidget(context: Context, appWidgetManager: AppWidgetManager, appWidgetId: Int) {
            val views = RemoteViews(context.packageName, R.layout.widget_global)
            val prefs = context.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE)

            val showTasks = prefs.getString("widget_global_show_tasks", "true") == "true"
            val showEvents = prefs.getString("widget_global_show_events", "true") == "true"
            val selectedDim = prefs.getString("widget_filter_dimension", "")
            val titleText = if (selectedDim.isNullOrEmpty() || selectedDim == "Todas") "Dimensões" else selectedDim
            views.setTextViewText(R.id.global_list_title, titleText)

            // Setup Adapter for Top-Right ListView
            val serviceIntent = Intent(context, EventsWidgetService::class.java).apply {
                putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId)
                data = Uri.parse(toUri(Intent.URI_INTENT_SCHEME))
            }
            views.setRemoteAdapter(R.id.global_list_view, serviceIntent)
            views.setEmptyView(R.id.global_list_view, R.id.global_empty_list_view)

            // Intenções dos botões
            val dimIntent = Intent(context, WidgetActionActivity::class.java).apply {
                putExtra("action", "change_dimension")
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
            }
            val dimPendingIntent = PendingIntent.getActivity(context, 100, dimIntent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            views.setOnClickPendingIntent(R.id.global_title_container, dimPendingIntent)

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
            val monthFormat = SimpleDateFormat("MMMM yyyy", Locale("pt", "BR"))
            val monthTitle = monthFormat.format(mCal.time).replaceFirstChar { it.uppercase() }
            views.setTextViewText(R.id.global_month_title, monthTitle)

            views.removeAllViews(R.id.global_month_grid_container)
            val monthCal = mCal.clone() as Calendar
            monthCal.set(Calendar.DAY_OF_MONTH, 1)
            val firstDayOffset = monthCal.get(Calendar.DAY_OF_WEEK) - Calendar.SUNDAY
            val maxDaysInMonth = monthCal.getActualMaximum(Calendar.DAY_OF_MONTH)
            
            var dayCounter = 1 - firstDayOffset
            for (row in 0..5) {
                val rowViews = RemoteViews(context.packageName, R.layout.item_weekly_calendar_row)
                for (col in 0..6) {
                    val dayCell = RemoteViews(context.packageName, R.layout.item_mini_month_day)
                    if (dayCounter in 1..maxDaysInMonth) {
                        dayCell.setTextViewText(R.id.mini_day_text, dayCounter.toString())
                    } else {
                        dayCell.setTextViewText(R.id.mini_day_text, "")
                    }
                    rowViews.addView(R.id.row_container, dayCell)
                    dayCounter++
                }
                views.addView(R.id.global_month_grid_container, rowViews)
                if (dayCounter > maxDaysInMonth) break
            }

            // POPULATE WEEKLY CALENDAR (Bottom)
            val weekOffset = prefs.getInt("global_week_offset", 0)
            val wCal = Calendar.getInstance()
            wCal.firstDayOfWeek = Calendar.SUNDAY
            wCal.set(Calendar.DAY_OF_WEEK, Calendar.SUNDAY)
            wCal.add(Calendar.WEEK_OF_YEAR, weekOffset)

            views.removeAllViews(R.id.global_weekly_grid_container)
            val splitType = prefs.getString("widget_weekly_split_type", "12h") ?: "12h"

            for (dayIndex in 0..20) {
                val dayOfWeek = dayIndex % 7
                val cellLayout = when (splitType) {
                    "8h" -> R.layout.item_weekly_calendar_cell_8h
                    "12h" -> R.layout.item_weekly_calendar_cell
                    else -> R.layout.item_calendar_cell
                }
                val cellViews = RemoteViews(context.packageName, cellLayout)
                val dayNum = wCal.get(Calendar.DAY_OF_MONTH)
                val daysOfWeekShort = arrayOf("D", "S", "T", "Q", "Q", "S", "S")

                cellViews.setTextViewText(R.id.cell_day_of_week_text, daysOfWeekShort[dayOfWeek])
                cellViews.setTextViewText(R.id.cell_day_text, dayNum.toString())
                
                views.addView(R.id.global_weekly_grid_container, cellViews)

                if (dayOfWeek == 6 && dayIndex < 20) {
                    val dividerView = RemoteViews(context.packageName, R.layout.item_week_divider)
                    views.addView(R.id.global_weekly_grid_container, dividerView)
                }

                wCal.add(Calendar.DAY_OF_MONTH, 1)
            }

            appWidgetManager.updateAppWidget(appWidgetId, views)
            appWidgetManager.notifyAppWidgetViewDataChanged(appWidgetId, R.id.global_list_view)
        }
    }
}
