// Content script for ExplainSnap extension
// This script runs in the context of the webpage

// Listen for messages from the extension
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === "showCaptureFeedback") {
    showCaptureFeedback(request.message, request.success);
  }
});

// Function to show a feedback message to the user
function showCaptureFeedback(message, success = true) {
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
    document.body.removeChild(notification);
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
}

// Add custom styles for extension UI elements
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