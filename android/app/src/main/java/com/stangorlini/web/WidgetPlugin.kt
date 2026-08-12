package com.stangorlini.web

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Intent
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "WidgetPlugin")
class WidgetPlugin : Plugin() {

    @PluginMethod
    fun updateWidget(call: PluginCall) {
        val context = context
        val widgetManager = AppWidgetManager.getInstance(context)

        val providers = arrayOf(
            EventsWidgetProvider::class.java,
            CalendarWidgetProvider::class.java,
            WeeklyCalendarWidgetProvider::class.java,
            GlobalWidgetProvider::class.java
        )

        for (provider in providers) {
            val intent = Intent(context, provider).apply {
                action = AppWidgetManager.ACTION_APPWIDGET_UPDATE
                val ids = widgetManager.getAppWidgetIds(ComponentName(context, provider))
                putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids)
            }
            context.sendBroadcast(intent)
            if (provider == EventsWidgetProvider::class.java) {
                val ids = widgetManager.getAppWidgetIds(ComponentName(context, provider))
                widgetManager.notifyAppWidgetViewDataChanged(ids, R.id.widget_events_list)
            } else if (provider == GlobalWidgetProvider::class.java) {
                val ids = widgetManager.getAppWidgetIds(ComponentName(context, provider))
                widgetManager.notifyAppWidgetViewDataChanged(ids, R.id.global_list_view)
            }
        }

        call.resolve()
    }
}
