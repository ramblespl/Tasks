import { GoogleTaskList, GoogleTaskItem } from '../types';
import { refreshGoogleTokenSilently, clearStoredAuth } from './firebaseAuth';

const fetchTasksWithRetry = async (
  url: string,
  options: RequestInit,
  retries = 1
): Promise<Response> => {
  try {
    const res = await fetch(url, options);
    if (res.status === 401) {
      if (retries > 0) {
        const freshToken = await refreshGoogleTokenSilently();
        if (freshToken) {
          const newHeaders = new Headers(options.headers || {});
          newHeaders.set('Authorization', `Bearer ${freshToken}`);
          return await fetch(url, { ...options, headers: newHeaders });
        }
      }
    }
    return res;
  } catch (err: any) {
    if (retries > 0) {
      await new Promise((resolve) => setTimeout(resolve, 400));
      return fetchTasksWithRetry(url, options, retries - 1);
    }
    throw new Error(
      `Błąd połączenia z Google Tasks API (${err.message || 'Failed to fetch'}). Sprawdź połączenie z internetem lub rozszerzenia blokujące.`
    );
  }
};

export const listTaskLists = async (token: string): Promise<GoogleTaskList[]> => {
  if (!token || !token.trim()) {
    throw new Error('Brak tokenu autoryzacji Google. Zaloguj się ponownie.');
  }

  const response = await fetchTasksWithRetry('https://tasks.googleapis.com/tasks/v1/users/@me/lists', {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Sesja Google wygasła (401). Zaloguj się ponownie, aby odświeżyć uprawnienia.');
    }
    if (response.status === 403) {
      throw new Error(
        'Brak uprawnień do Google Tasks (403). Zaloguj się ponownie i zaznacz zgodę na dostęp do zadań.'
      );
    }
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.error?.message || `Nie udało się pobrać list zadań Google (${response.status})`
    );
  }

  const data = await response.json();
  return (data.items || []).map((item: any) => ({
    id: item.id,
    title: item.title,
    updated: item.updated,
  }));
};

export const createTaskList = async (token: string, title: string): Promise<GoogleTaskList> => {
  if (!token || !token.trim()) {
    throw new Error('Brak tokenu autoryzacji Google. Zaloguj się ponownie.');
  }

  const response = await fetchTasksWithRetry('https://tasks.googleapis.com/tasks/v1/users/@me/lists', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ title }),
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Sesja Google wygasła (401). Zaloguj się ponownie.');
    }
    if (response.status === 403) {
      throw new Error(
        'Brak uprawnień do Google Tasks (403). Zaloguj się ponownie i zaznacz zgodę na dostęp do zadań.'
      );
    }
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.error?.message || `Nie udało się utworzyć listy zadań (${response.status})`
    );
  }

  const data = await response.json();
  return {
    id: data.id,
    title: data.title,
    updated: data.updated,
  };
};

export const findOrCreateDefaultTaskList = async (
  token: string,
  preferredTitle: string = 'Zadania'
): Promise<{ list: GoogleTaskList; wasCreated: boolean }> => {
  const lists = await listTaskLists(token);
  if (lists.length > 0) {
    const normalized = preferredTitle.trim().toLowerCase();
    const existing =
      lists.find((l) => l.title?.trim().toLowerCase() === normalized) ||
      lists.find((l) => l.title?.trim().toLowerCase().includes('zadania') || l.title?.trim().toLowerCase().includes('tasks')) ||
      lists[0];
    return { list: existing, wasCreated: false };
  }

  // Create list named preferredTitle
  const newList = await createTaskList(token, preferredTitle);
  return { list: newList, wasCreated: true };
};

export const findOrCreateTravelTaskList = findOrCreateDefaultTaskList;

export const getTasksInList = async (
  token: string,
  taskListId: string
): Promise<GoogleTaskItem[]> => {
  if (!token || !token.trim()) {
    throw new Error('Brak tokenu autoryzacji Google. Zaloguj się ponownie.');
  }

  const allItems: any[] = [];
  let pageToken: string | undefined = undefined;

  do {
    const url = new URL(`https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(taskListId)}/tasks`);
    url.searchParams.set('showCompleted', 'true');
    url.searchParams.set('showHidden', 'true');
    url.searchParams.set('maxResults', '100');
    if (pageToken) {
      url.searchParams.set('pageToken', pageToken);
    }

    const response = await fetchTasksWithRetry(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Sesja Google wygasła (401). Zaloguj się ponownie.');
      }
      if (response.status === 403) {
        throw new Error(
          'Brak uprawnień do Google Tasks (403). Zaloguj się ponownie i zaznacz zgodę na dostęp do zadań.'
        );
      }
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.error?.message || `Nie udało się pobrać zadań z listy (${response.status})`
      );
    }

    const data = await response.json();
    if (data.items && Array.isArray(data.items)) {
      allItems.push(...data.items);
    }
    pageToken = data.nextPageToken;
  } while (pageToken);

  return allItems.map((item: any) => ({
    id: item.id,
    title: item.title || '(Bez tytułu)',
    notes: item.notes,
    due: item.due,
    status: item.status as 'needsAction' | 'completed',
    completed: item.completed,
    updated: item.updated,
  }));
};

export interface CreateTaskPayload {
  title: string;
  notes?: string;
  due?: string; // RFC 3339 timestamp (e.g. 2026-10-15T00:00:00.000Z)
}

export const createGoogleTask = async (
  token: string,
  taskListId: string,
  payload: CreateTaskPayload
): Promise<GoogleTaskItem> => {
  if (!token || !token.trim()) {
    throw new Error('Brak tokenu autoryzacji Google. Zaloguj się ponownie.');
  }

  const body: any = {
    title: payload.title,
  };
  if (payload.notes) body.notes = payload.notes;
  if (payload.due) {
    body.due = payload.due;
  }

  const response = await fetchTasksWithRetry(
    `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(taskListId)}/tasks`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    }
  );

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Sesja Google wygasła (401). Zaloguj się ponownie.');
    }
    if (response.status === 403) {
      throw new Error('Brak uprawnień do tworzenia zadań w Google Tasks (403).');
    }
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.error?.message || `Nie udało się utworzyć zadania "${payload.title}" (${response.status})`
    );
  }

  const item = await response.json();
  return {
    id: item.id,
    title: item.title,
    notes: item.notes,
    due: item.due,
    status: item.status,
    completed: item.completed,
    updated: item.updated,
  };
};

export const updateTaskStatus = async (
  token: string,
  taskListId: string,
  taskId: string,
  status: 'completed' | 'needsAction'
): Promise<void> => {
  if (!token || !token.trim()) {
    throw new Error('Brak tokenu autoryzacji Google. Zaloguj się ponownie.');
  }

  const body: any = { status };
  if (status === 'completed') {
    body.completed = new Date().toISOString();
  }

  const response = await fetchTasksWithRetry(
    `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(taskListId)}/tasks/${encodeURIComponent(taskId)}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    }
  );

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Sesja Google wygasła (401). Zaloguj się ponownie.');
    }
    if (response.status === 403) {
      throw new Error('Brak uprawnień do edycji zadań w Google Tasks (403).');
    }
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.error?.message || `Nie udało się zaktualizować statusu zadania (${response.status})`
    );
  }
};

export const deleteGoogleTask = async (
  token: string,
  taskListId: string,
  taskId: string
): Promise<void> => {
  if (!token || !token.trim()) {
    throw new Error('Brak tokenu autoryzacji Google. Zaloguj się ponownie.');
  }

  const response = await fetchTasksWithRetry(
    `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(taskListId)}/tasks/${encodeURIComponent(taskId)}`,
    {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Sesja Google wygasła (401). Zaloguj się ponownie.');
    }
    if (response.status === 403) {
      throw new Error('Brak uprawnień do usuwania zadań w Google Tasks (403).');
    }
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.error?.message || `Nie udało się usunąć zadania (${response.status})`
    );
  }
};

export const ALL_TASK_LISTS_ID = '__ALL_TASK_LISTS__';

export const ALL_TASK_LISTS_ITEM: GoogleTaskList = {
  id: ALL_TASK_LISTS_ID,
  title: 'Wszystkie listy zadań',
  updated: '',
};

export const updateGoogleTask = async (
  token: string,
  taskListId: string,
  taskId: string,
  patch: { title?: string; notes?: string; due?: string }
): Promise<void> => {
  if (!token || !token.trim()) {
    throw new Error('Brak tokenu autoryzacji Google. Zaloguj się ponownie.');
  }

  const body: any = {};
  if (patch.title !== undefined) body.title = patch.title;
  if (patch.notes !== undefined) body.notes = patch.notes;
  if (patch.due !== undefined) body.due = patch.due;

  const response = await fetchTasksWithRetry(
    `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(taskListId)}/tasks/${encodeURIComponent(taskId)}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    }
  );

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Sesja Google wygasła (401). Zaloguj się ponownie.');
    }
    if (response.status === 403) {
      throw new Error('Brak uprawnień do edycji zadań w Google Tasks (403).');
    }
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.error?.message || `Nie udało się zaktualizować zadania (${response.status})`
    );
  }
};

/**
 * Fetch and aggregate tasks from all task lists
 */
export const getAllTaskListsTasks = async (
  token: string,
  taskLists: GoogleTaskList[]
): Promise<GoogleTaskItem[]> => {
  if (!token || !taskLists || taskLists.length === 0) return [];
  const validLists = taskLists.filter((l) => l.id !== ALL_TASK_LISTS_ID);

  const results = await Promise.allSettled(
    validLists.map(async (list) => {
      const tasks = await getTasksInList(token, list.id);
      return tasks.map((t) => ({
        ...t,
        taskListId: list.id,
        taskListTitle: list.title,
      }));
    })
  );

  const allItems: GoogleTaskItem[] = [];
  results.forEach((res) => {
    if (res.status === 'fulfilled') {
      allItems.push(...res.value);
    }
  });

  return allItems;
};

/**
 * Fetch and aggregate tasks from selected task lists
 */
export const getTasksForSelectedLists = async (
  token: string,
  selectedListIds: string[],
  taskLists: GoogleTaskList[]
): Promise<GoogleTaskItem[]> => {
  if (!token || !selectedListIds || selectedListIds.length === 0) return [];

  if (selectedListIds.includes(ALL_TASK_LISTS_ID)) {
    return getAllTaskListsTasks(token, taskLists);
  }

  const validLists = taskLists.filter(
    (l) => selectedListIds.includes(l.id) && l.id !== ALL_TASK_LISTS_ID
  );
  if (validLists.length === 0) return [];

  const results = await Promise.allSettled(
    validLists.map(async (list) => {
      const tasks = await getTasksInList(token, list.id);
      return tasks.map((t) => ({
        ...t,
        taskListId: list.id,
        taskListTitle: list.title,
      }));
    })
  );

  const allItems: GoogleTaskItem[] = [];
  results.forEach((res) => {
    if (res.status === 'fulfilled') {
      allItems.push(...res.value);
    }
  });

  return allItems;
};

/**
 * Moves a task from sourceTaskListId to targetTaskListId by creating it in the target list
 * and deleting it from the source list (Google Tasks API v1 doesn't support cross-list move endpoint).
 */
export const moveGoogleTaskToList = async (
  token: string,
  sourceTaskListId: string,
  targetTaskListId: string,
  taskId: string,
  taskData: {
    title: string;
    notes?: string;
    due?: string;
    status?: 'needsAction' | 'completed';
  }
): Promise<GoogleTaskItem> => {
  if (!token || !token.trim()) {
    throw new Error('Brak tokenu autoryzacji Google. Zaloguj się ponownie.');
  }

  // 1. Create task in target list
  const created = await createGoogleTask(token, targetTaskListId, {
    title: taskData.title,
    notes: taskData.notes,
    due: taskData.due,
  });

  // If status was completed, update in target list
  if (taskData.status === 'completed') {
    try {
      await updateTaskStatus(token, targetTaskListId, created.id, 'completed');
      created.status = 'completed';
    } catch (err) {
      console.warn('Failed to update completed status on moved task:', err);
    }
  }

  // 2. Delete original task from source list
  try {
    await deleteGoogleTask(token, sourceTaskListId, taskId);
  } catch (err) {
    console.warn('Failed to delete original task from source list after moving:', err);
  }

  return created;
};


