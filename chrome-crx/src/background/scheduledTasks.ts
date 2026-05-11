import {
  promptService,
  setStorageValue,
  StorageKeys,
  type SavedPrompt,
} from "../extensionServices";
import { tabGroupManager } from "../mcpRuntime";
import type { ScheduledTask } from "./types";

interface SidepanelWindowOptions {
  sessionId: string;
  skipPermissions?: boolean;
  model?: string;
}

interface ExecutionOptions {
  tabId: number;
  prompt: string;
  taskName?: string;
  runLogId: string;
  sessionId: string;
  isScheduledTask: boolean;
}

export function createScheduledTaskManager() {
  async function restoreScheduledAlarms() {
    try {
      const prompts = (await promptService.getAllPrompts()).filter(
        (prompt) => prompt.repeatType && prompt.repeatType !== "none",
      );

      if (prompts.length === 0) return;

      for (const prompt of prompts) {
        try {
          await promptService.updateAlarmForPrompt(prompt);
        } catch {
          // ignore
        }
      }

      try {
        await promptService.updateNextRunTimes();
      } catch {
        // ignore
      }
    } catch {
      // ignore
    }
  }

  async function openSidepanelWindow(options: SidepanelWindowOptions) {
    const { sessionId, skipPermissions, model } = options;
    const url = chrome.runtime.getURL(
      `sidepanel.html?mode=window&sessionId=${sessionId}${skipPermissions ? "&skipPermissions=true" : ""}${model ? `&model=${encodeURIComponent(model)}` : ""}`,
    );

    const windowHandle = await chrome.windows.create({
      url,
      type: "popup",
      width: 500,
      height: 768,
      left: 100,
      top: 100,
      focused: true,
    });

    if (!windowHandle) {
      throw new Error("Failed to create sidepanel window");
    }

    return windowHandle;
  }

  async function waitForTabAndExecute(options: ExecutionOptions) {
    const { tabId, prompt, taskName, runLogId, sessionId, isScheduledTask } = options;

    return new Promise<void>((resolve, reject) => {
      const timeout = 30_000;
      const startTime = Date.now();
      let done = false;

      const poll = async () => {
        try {
          if (Date.now() - startTime > timeout) {
            reject(new Error("Timeout waiting for tab to load for task execution"));
            return;
          }

          const tab = await chrome.tabs.get(tabId);
          if (tab.status !== "complete") {
            setTimeout(poll, 500);
            return;
          }

          setTimeout(() => {
            if (done) return;
            done = true;
            chrome.runtime.sendMessage(
              {
                type: "EXECUTE_TASK",
                prompt,
                taskName,
                runLogId,
                windowSessionId: sessionId,
                isScheduledTask,
              },
              () => {
                if (chrome.runtime.lastError) {
                  reject(new Error(`Failed to send prompt: ${chrome.runtime.lastError.message}`));
                  return;
                }
                resolve();
              },
            );
          }, 3_000);
        } catch (err) {
          reject(err);
        }
      };

      setTimeout(poll, 1_000);
    });
  }

  async function executeScheduledTask(task: ScheduledTask, runLogId: string) {
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    const windowHandle = await chrome.windows.create({
      url: task.url || "about:blank",
      type: "normal",
      focused: true,
    });

    if (!windowHandle?.id || !windowHandle.tabs?.length) {
      throw new Error("Failed to create window for scheduled task");
    }

    const firstTab = windowHandle.tabs[0];
    if (!firstTab.id) {
      throw new Error("Failed to get tab in new window for scheduled task");
    }

    await tabGroupManager.initialize(true);
    await tabGroupManager.createGroup(firstTab.id);
    await setStorageValue(StorageKeys.TARGET_TAB_ID, firstTab.id);

    await openSidepanelWindow({
      sessionId,
      skipPermissions: task.skipPermissions,
      model: task.model,
    });

    await waitForTabAndExecute({
      tabId: firstTab.id,
      prompt: task.prompt,
      taskName: task.name,
      runLogId,
      sessionId,
      isScheduledTask: true,
    });
  }

  async function getSavedPrompt(promptId: string): Promise<SavedPrompt | undefined> {
    const storage = await chrome.storage.local.get([StorageKeys.SAVED_PROMPTS]);
    const prompts = (storage[StorageKeys.SAVED_PROMPTS] || []) as SavedPrompt[];
    return prompts.find((prompt) => prompt.id === promptId);
  }

  function buildTaskFromSavedPrompt(savedPrompt: SavedPrompt): ScheduledTask {
    return {
      id: savedPrompt.id,
      name: savedPrompt.command || "Scheduled Task",
      prompt: savedPrompt.prompt,
      url: savedPrompt.url,
      enabled: true,
      skipPermissions: savedPrompt.skipPermissions !== false,
      model: savedPrompt.model,
    };
  }

  function isRecurringPrompt(savedPrompt: SavedPrompt): boolean {
    return savedPrompt.repeatType === "monthly" || savedPrompt.repeatType === "annually";
  }

  async function notify(title: string, message: string) {
    try {
      await chrome.notifications.create({
        type: "basic",
        iconUrl: "/icon-128.png",
        title,
        message,
        priority: 2,
      });
    } catch {
      // ignore
    }
  }

  async function rescheduleRecurringPrompt(savedPrompt: SavedPrompt, promptId: string) {
    try {
      await promptService.updateAlarmForPrompt(savedPrompt);
    } catch {
      const retryAlarmName = `retry_${promptId}`;
      try {
        await chrome.alarms.create(retryAlarmName, { delayInMinutes: 1 });
      } catch {
        // ignore
      }

      await notify(
        "Scheduled Task Setup Failed",
        `Failed to schedule next occurrence of "${savedPrompt.command || "Scheduled Task"}". Please check the task settings.`,
      );
    }
  }

  async function handlePromptAlarm(promptId: string) {
    try {
      const savedPrompt = await getSavedPrompt(promptId);
      if (!savedPrompt) return;

      let executionError: Error | null = null;
      const runLogId = `${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

      try {
        await executeScheduledTask(buildTaskFromSavedPrompt(savedPrompt), runLogId);
      } catch (err) {
        executionError = err instanceof Error ? err : new Error(String(err));
        await notify(
          "Scheduled Task Failed",
          `Task "${savedPrompt.command || "Scheduled Task"}" failed to execute. ${executionError.message}`,
        );
      }

      if (isRecurringPrompt(savedPrompt)) {
        await rescheduleRecurringPrompt(savedPrompt, promptId);
      }
    } catch {
      // ignore
    }
  }

  async function handleRetryAlarm(promptId: string) {
    try {
      const savedPrompt = await getSavedPrompt(promptId);
      if (!savedPrompt || !isRecurringPrompt(savedPrompt)) return;

      try {
        await promptService.updateAlarmForPrompt(savedPrompt);
      } catch {
        await notify(
          "Scheduled Task Needs Attention",
          `Could not automatically reschedule "${savedPrompt.command || "Scheduled Task"}". Please edit the task to reschedule it.`,
        );
      }
    } catch {
      // ignore
    }
  }

  async function handleAlarm(alarm: chrome.alarms.Alarm) {
    if (alarm.name.startsWith("prompt_")) {
      await handlePromptAlarm(alarm.name);
      return;
    }

    if (alarm.name.startsWith("retry_")) {
      await handleRetryAlarm(alarm.name.replace("retry_", ""));
    }
  }

  return {
    restoreScheduledAlarms,
    executeScheduledTask,
    handleAlarm,
  };
}
