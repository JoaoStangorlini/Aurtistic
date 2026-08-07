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

        // 1. Update Favorites Widget (Tarefas)
        val favIntent = Intent(context, FavoritesWidgetProvider::class.java).apply {
            action = AppWidgetManager.ACTION_APPWIDGET_UPDATE
            val ids = widgetManager.getAppWidgetIds(ComponentName(context, FavoritesWidgetProvider::class.java))
            putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids)
        }
        context.sendBroadcast(favIntent)

        // 2. Update Calendar Widget (Calendário)
        val calIntent = Intent(context, CalendarWidgetProvider::class.java).apply {
            action = AppWidgetManager.ACTION_APPWIDGET_UPDATE
            val ids = widgetManager.getAppWidgetIds(ComponentName(context, CalendarWidgetProvider::class.java))
            putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids)
        }
        context.sendBroadcast(calIntent)

        // 3. Update Events Widget (Eventos)
        val evIntent = Intent(context, EventsWidgetProvider::class.java).apply {
            action = AppWidgetManager.ACTION_APPWIDGET_UPDATE
            val ids = widgetManager.getAppWidgetIds(ComponentName(context, EventsWidgetProvider::class.java))
            putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids)
        }
        context.sendBroadcast(evIntent)

        call.resolve()
    }
}
