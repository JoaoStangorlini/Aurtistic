package com.stangorlini.web

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.RemoteViews

class FavoritesWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        for (appWidgetId in appWidgetIds) {
            updateAppWidget(context, appWidgetManager, appWidgetId)
        }
    }

    companion object {
        fun updateAppWidget(context: Context, appWidgetManager: AppWidgetManager, appWidgetId: Int) {
            val views = RemoteViews(context.packageName, R.layout.widget_favorites)

            // Setup Intent for the ListService
            val intent = Intent(context, FavoritesWidgetService::class.java).apply {
                putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId)
                data = Uri.parse(toUri(Intent.URI_INTENT_SCHEME))
            }

            views.setRemoteAdapter(R.id.widget_list_view, intent)
            views.setEmptyView(R.id.widget_list_view, R.id.empty_view)

            // Setup intent for Add Button
            val addIntent = Intent(context, WidgetActionActivity::class.java).apply {
                putExtra("action", "create_task")
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
            }
            val addPendingIntent = PendingIntent.getActivity(context, 0, addIntent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            views.setOnClickPendingIntent(R.id.widget_add_button, addPendingIntent)

            // Setup intent for Dimension Title
            val titleIntent = Intent(context, WidgetActionActivity::class.java).apply {
                putExtra("action", "change_dimension")
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
            }
            val titlePendingIntent = PendingIntent.getActivity(context, 1, titleIntent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            views.setOnClickPendingIntent(R.id.widget_title, titlePendingIntent)
            
            // Set dynamic title based on selected dimension
            val prefs = context.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE)
            val selectedDim = prefs.getString("widget_filter_dimension", "") ?: ""
            val titleText = if (selectedDim.isEmpty()) "Todas as Dimensões ▼" else "$selectedDim ▼"
            views.setTextViewText(R.id.widget_title, titleText)
            
            // To allow item clicks (we will direct it to WidgetActionActivity)
            val clickIntentTemplate = Intent(context, WidgetActionActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
            }
            val clickPendingIntentTemplate = PendingIntent.getActivity(context, 2, clickIntentTemplate, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE)
            views.setPendingIntentTemplate(R.id.widget_list_view, clickPendingIntentTemplate)

            // Setup intent for Background (widget_root)
            val bgIntent = Intent(context, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
            }
            val bgPendingIntent = PendingIntent.getActivity(context, 3, bgIntent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            views.setOnClickPendingIntent(R.id.widget_root, bgPendingIntent)

            // Tell the AppWidgetManager to perform an update on the current app widget
            appWidgetManager.updateAppWidget(appWidgetId, views)
            appWidgetManager.notifyAppWidgetViewDataChanged(appWidgetId, R.id.widget_list_view)
        }
    }
}
