package com.stangorlini.web

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.RemoteViews

class EventsWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        for (appWidgetId in appWidgetIds) {
            updateAppWidget(context, appWidgetManager, appWidgetId)
        }
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        val action = intent.action
        
        if (action == "ACTION_TOGGLE_EVENTS") {
            val prefs = context.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE)
            val showE = prefs.getString("widget_list_show_events", "true") == "true"
            prefs.edit().putString("widget_list_show_events", (!showE).toString()).apply()
            
            val appWidgetManager = AppWidgetManager.getInstance(context)
            val appWidgetIds = appWidgetManager.getAppWidgetIds(android.content.ComponentName(context, EventsWidgetProvider::class.java))
            onUpdate(context, appWidgetManager, appWidgetIds)
            appWidgetManager.notifyAppWidgetViewDataChanged(appWidgetIds, R.id.widget_events_list)
        }
        
        if (action == "ACTION_TOGGLE_TASKS") {
            val prefs = context.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE)
            val showT = prefs.getString("widget_list_show_tasks", "true") == "true"
            prefs.edit().putString("widget_list_show_tasks", (!showT).toString()).apply()
            
            val appWidgetManager = AppWidgetManager.getInstance(context)
            val appWidgetIds = appWidgetManager.getAppWidgetIds(android.content.ComponentName(context, EventsWidgetProvider::class.java))
            onUpdate(context, appWidgetManager, appWidgetIds)
            appWidgetManager.notifyAppWidgetViewDataChanged(appWidgetIds, R.id.widget_events_list)
        }
    }

    companion object {
        fun updateAppWidget(context: Context, appWidgetManager: AppWidgetManager, appWidgetId: Int) {
            val views = RemoteViews(context.packageName, R.layout.widget_events)

            val intent = Intent(context, EventsWidgetService::class.java).apply {
                putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId)
                data = Uri.parse(toUri(Intent.URI_INTENT_SCHEME))
            }

            views.setRemoteAdapter(R.id.widget_events_list, intent)
            views.setEmptyView(R.id.widget_events_list, R.id.empty_events_view)

            // Setup intent for Add Button
            val addIntent = Intent(context, WidgetActionActivity::class.java).apply {
                putExtra("action", "create_event")
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
            }
            val addPendingIntent = PendingIntent.getActivity(context, 20, addIntent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            views.setOnClickPendingIntent(R.id.widget_add_button, addPendingIntent)

            // Setup intent for Title (Dimensions)
            val prefs = context.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE)
            val selectedDim = prefs.getString("widget_filter_dimension", "")
            val titleText = if (selectedDim.isNullOrEmpty() || selectedDim == "Todas") "Dimensões" else selectedDim
            views.setTextViewText(R.id.widget_title, titleText)

            val dimIntent = Intent(context, WidgetActionActivity::class.java).apply {
                putExtra("action", "change_dimension")
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
            }
            val dimPendingIntent = PendingIntent.getActivity(context, 22, dimIntent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            views.setOnClickPendingIntent(R.id.widget_title_container, dimPendingIntent)
            views.setOnClickPendingIntent(R.id.widget_title, dimPendingIntent)


            val showTasks = prefs.getString("widget_list_show_tasks", "true") == "true"
            val showEvents = prefs.getString("widget_list_show_events", "true") == "true"

            val toggleEventsIntent = Intent(context, EventsWidgetProvider::class.java).apply { action = "ACTION_TOGGLE_EVENTS" }
            val pendingToggleEvents = PendingIntent.getBroadcast(context, 3, toggleEventsIntent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            views.setOnClickPendingIntent(R.id.btn_toggle_events, pendingToggleEvents)
            if (showEvents) {
                views.setInt(R.id.btn_toggle_events, "setBackgroundResource", R.drawable.bg_event_pill_default)
            } else {
                views.setInt(R.id.btn_toggle_events, "setBackgroundResource", R.drawable.bg_event_pill_disabled)
            }

            val toggleTasksIntent = Intent(context, EventsWidgetProvider::class.java).apply { action = "ACTION_TOGGLE_TASKS" }
            val pendingToggleTasks = PendingIntent.getBroadcast(context, 4, toggleTasksIntent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            views.setOnClickPendingIntent(R.id.btn_toggle_tasks, pendingToggleTasks)
            if (showTasks) {
                views.setInt(R.id.btn_toggle_tasks, "setBackgroundResource", R.drawable.bg_task_pill_default)
            } else {
                views.setInt(R.id.btn_toggle_tasks, "setBackgroundResource", R.drawable.bg_task_pill_disabled)
            }

            // Setup intent for Root Click (open app)
            val bgIntent = Intent(context, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
            }
            val bgPendingIntent = PendingIntent.getActivity(context, 21, bgIntent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            views.setOnClickPendingIntent(R.id.widget_root, bgPendingIntent)

            appWidgetManager.updateAppWidget(appWidgetId, views)
            appWidgetManager.notifyAppWidgetViewDataChanged(appWidgetId, R.id.widget_events_list)
        }
    }
}
