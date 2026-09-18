const CONTEXT_MENU_ID = 'project-agent-ask-selection';
const PENDING_PROMPT_KEY = 'project-agent.pending-prompt';

async function configureSidePanel() {
  if (!chrome.sidePanel?.setPanelBehavior) return;

  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  } catch (error) {
    // Older Chromium builds may not expose the side panel behavior API.
    console.debug('Side panel behavior is unavailable.', error);
  }
}

async function configureContextMenu() {
  if (!chrome.contextMenus) return;

  try {
    await chrome.contextMenus.removeAll();
    chrome.contextMenus.create({
      id: CONTEXT_MENU_ID,
      title: 'اسأل وكيل المشروع عن النص المحدد',
      contexts: ['selection']
    });
  } catch (error) {
    console.debug('Context menu could not be configured.', error);
  }
}

async function initializeExtension() {
  await Promise.all([configureSidePanel(), configureContextMenu()]);
}

chrome.runtime.onInstalled.addListener(initializeExtension);
chrome.runtime.onStartup.addListener(initializeExtension);

chrome.commands?.onCommand.addListener(async (command) => {
  if (command !== 'open-project-agent') return;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id && chrome.sidePanel?.open) {
    try {
      await chrome.sidePanel.open({ tabId: tab.id });
    } catch (error) {
      console.debug('Could not open the side panel from the shortcut.', error);
    }
  }
});

chrome.contextMenus?.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== CONTEXT_MENU_ID || !tab?.id) return;

  const selectedText = (info.selectionText || '').trim().slice(0, 6000);
  const prompt = selectedText
    ? `حلّل النص المحدد التالي، واشرح كيف يمكن أن يخدم مشروعي أو ما الإجراء العملي المقترح:\n\n${selectedText}`
    : 'حلّل الجزء الذي حددته من الصفحة واقترح الخطوة التالية في مشروعي.';

  try {
    await chrome.storage.local.set({
      [PENDING_PROMPT_KEY]: {
        prompt,
        tabId: tab.id,
        createdAt: Date.now()
      }
    });

    if (chrome.sidePanel?.open) {
      await chrome.sidePanel.open({ tabId: tab.id });
    }
  } catch (error) {
    console.debug('Could not save the context-menu prompt.', error);
  }
});
