// Content script for ExplainSnap extension
// Immediately check if we have access to the extension API
let extensionAccessible = false;
try {
  extensionAccessible = typeof chrome !== 'undefined' && !!chrome.runtime && !!chrome.runtime.id;
  console.log("Extension accessibility check:", extensionAccessible);
} catch (e) {
  console.error("Extension API not accessible:", e);
}

// Only proceed if we have access to the extension
if (extensionAccessible) {
  // Set up a one-time initialization
  initializeContentScript();
}

function initializeContentScript() {
  console.log("Initializing ExplainSnap content script");
  
  // Create a disconnection detector
  let connectionDetector = setInterval(() => {
    try {
      // This will throw if disconnected
      if (!chrome.runtime || !chrome.runtime.id) {
        console.log("Detected extension context invalidation");
        clearInterval(connectionDetector);
      }
    } catch (e) {
      console.log("Extension disconnected:", e);
      clearInterval(connectionDetector);
    }
  }, 5000);
  
  // Message listener
  const messageListener = function(request, sender, sendResponse) {
    // Always immediately acknowledge receipt
    sendResponse({received: true});
    
    try {
      if (request.action === "showCaptureFeedback") {
        showCaptureFeedback(request.message, request.success);
      }
    } catch (error) {
      console.error("Error handling message:", error);
    }
    
    // Always return false, we've already called sendResponse
    return false;
  };
  
  // Add the listener
  try {
    chrome.runtime.onMessage.addListener(messageListener);
    console.log("Message listener registered");
  } catch (e) {
    console.error("Failed to register message listener:", e);
  }

  // Function to show a feedback message to the user
  function showCaptureFeedback(message, success = true) {
    try {
      // Create a floating notification
      const notification = document.createElement('div');
      notification.style.position = 'fixed';
      notification.style.bottom = '20px';
      notification.style.right = '20px';
      notification.style.padding = '10px 15px';
      notification.style.borderRadius = '4px';
      notification.style.boxShadow = '0 2px 10px rgba(0,0,0,0.2)';
      notification.style.zIndex = '2147483647';
      notification.style.fontSize = '14px';
      notification.style.fontFamily = 'Arial, sans-serif';
      notification.style.transition = 'opacity 0.3s ease-in-out';
      
      if (success) {
        notification.style.backgroundColor = '#9b59b6';
        notification.style.color = 'white';
      } else {
        notification.style.backgroundColor = '#e74c3c';
        notification.style.color = 'white';
      }
      
      notification.textContent = message;
      
      // Add close button
      const closeBtn = document.createElement('span');
      closeBtn.textContent = '×';
      closeBtn.style.marginLeft = '10px';
      closeBtn.style.cursor = 'pointer';
      closeBtn.style.fontWeight = 'bold';
      closeBtn.style.fontSize = '18px';
      closeBtn.addEventListener('click', function() {
        if (document.body.contains(notification)) {
          document.body.removeChild(notification);
        }
      });
      
      notification.appendChild(closeBtn);
      document.body.appendChild(notification);
      
      // Auto-hide after 5 seconds
      setTimeout(function() {
        if (document.body.contains(notification)) {
          notification.style.opacity = '0';
          setTimeout(function() {
            if (document.body.contains(notification)) {
              document.body.removeChild(notification);
            }
          }, 300);
        }
      }, 5000);
    } catch (error) {
      console.error("Error showing notification:", error);
    }
  }

  // Add custom styles for extension UI elements
  try {
    const style = document.createElement('style');
    style.textContent = `
      .explainsnap-tooltip {
        position: absolute;
        background-color: #8e44ad;
        color: white;
        padding: 6px 10px;
        border-radius: 4px;
        font-size: 12px;
        font-family: Arial, sans-serif;
        pointer-events: none;
        z-index: 2147483647;
        box-shadow: 0 2px 5px rgba(0,0,0,0.2);
        max-width: 200px;
        white-space: nowrap;
      }
      
      .explainsnap-tooltip:after {
        content: '';
        position: absolute;
        top: 100%;
        left: 50%;
        margin-left: -5px;
        border-width: 5px;
        border-style: solid;
        border-color: #8e44ad transparent transparent transparent;
      }
    `;
    document.head.appendChild(style);
    console.log("Extension styles added");
  } catch (error) {
    console.error("Error adding styles:", error);
  }
}