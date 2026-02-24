// content.js
'use strict';

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'checkUnsavedForms') {
        // Check if there are any forms with unsaved data
        let hasUnsavedForms = false;
        const forms = document.querySelectorAll('form');
        
        for (const form of forms) {
            const inputs = form.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea, select');
            for (const input of inputs) {
                // If it's a text input/textarea and has a value that isn't its default
                if ((input.type === 'text' || input.tagName.toLowerCase() === 'textarea') && input.value !== input.defaultValue) {
                    hasUnsavedForms = true;
                    break;
                }
                // If it's a checkbox/radio and its checked state changed
                if ((input.type === 'checkbox' || input.type === 'radio') && input.checked !== input.defaultChecked) {
                    hasUnsavedForms = true;
                    break;
                }
                // If it's a select and its selected option changed
                if (input.tagName.toLowerCase() === 'select') {
                    for (const option of input.options) {
                        if (option.selected !== option.defaultSelected) {
                            hasUnsavedForms = true;
                            break;
                        }
                    }
                }
            }
            if (hasUnsavedForms) break;
        }
        
        sendResponse({ hasUnsavedForms });
    }
    return true;
});
