// Este programa é um software livre (Licença AGPLv3)
import { saveTask as saveTaskServer, deleteTask as deleteTaskServer, updateMultipleTasks as updateMultipleTasksServer, deleteMultipleTasks as deleteMultipleTasksServer } from '@/app/(dashboard)/actions';
import { pushMutation } from './offlineSync';
import { Task } from '@/types';

export const saveTask = async (task: Partial<Task>) => {
  try {
    return await saveTaskServer(task);
  } catch (err: any) {
    if (err.message?.includes('Failed to fetch') || !window.navigator.onLine) {
      console.warn('Offline: Queueing saveTask mutation');
      await pushMutation({ type: 'update', taskId: task.id || 'new_' + Date.now(), payload: task });
      return;
    }
    throw err;
  }
};

export const deleteTask = async (id: string) => {
  try {
    return await deleteTaskServer(id);
  } catch (err: any) {
    if (err.message?.includes('Failed to fetch') || !window.navigator.onLine) {
      console.warn('Offline: Queueing deleteTask mutation');
      await pushMutation({ type: 'delete', taskId: id, payload: {} });
      return;
    }
    throw err;
  }
};

export const updateMultipleTasks = async (ids: string[], updates: any) => {
  try {
    return await updateMultipleTasksServer(ids, updates);
  } catch (err: any) {
    if (err.message?.includes('Failed to fetch') || !window.navigator.onLine) {
      console.warn('Offline: Queueing updateMultipleTasks mutation');
      for (const id of ids) {
        await pushMutation({ type: 'update', taskId: id, payload: updates });
      }
      return;
    }
    throw err;
  }
};

export const deleteMultipleTasks = async (ids: string[]) => {
  try {
    return await deleteMultipleTasksServer(ids);
  } catch (err: any) {
    if (err.message?.includes('Failed to fetch') || !window.navigator.onLine) {
      console.warn('Offline: Queueing deleteMultipleTasks mutation');
      for (const id of ids) {
        await pushMutation({ type: 'delete', taskId: id });
      }
      return;
    }
    throw err;
  }
};
