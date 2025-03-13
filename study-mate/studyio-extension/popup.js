document.addEventListener('DOMContentLoaded', function() {
  // Elements
  const captureBtn = document.getElementById('captureBtn');
  const aiToggle = document.getElementById('aiToggle');
  const stepsToggle = document.getElementById('stepsToggle');
  const settingsBtn = document.getElementById('settingsBtn');
  const helpBtn = document.getElementById('helpBtn');
  const historyItems = document.getElementById('historyItems');
  
  // Load user preferences
  chrome.storage.sync.get(['aiEnabled', 'stepsEnabled'], function(result) {
    if (result.aiEnabled !== undefined) {
      aiToggle.checked = result.aiEnabled;
    }
    if (result.stepsEnabled !== undefined) {
      stepsToggle.checked = result.stepsEnabled;
    }
  });
  
  // Save preferences when changed
  aiToggle.addEventListener('change', function() {
    chrome.storage.sync.set({ aiEnabled: aiToggle.checked });
  });
  
  stepsToggle.addEventListener('change', function() {
    chrome.storage.sync.set({ stepsEnabled: stepsToggle.checked });
  });
  
  // Capture button click handler
  captureBtn.addEventListener('click', function() {
    // Send message to background script BEFORE closing the popup
    chrome.runtime.sendMessage({
      action: 'initiate_capture',
      options: {
        aiEnabled: aiToggle.checked,
        stepsEnabled: stepsToggle.checked
      }
    }, function(response) {
      // Only close the popup after the message has been sent
      window.close();
    });
  });
  
  // Settings button click handler
  settingsBtn.addEventListener('click', function() {
    chrome.runtime.openOptionsPage();
  });
  
  // Help button click handler
  helpBtn.addEventListener('click', function() {
    chrome.tabs.create({ url: 'help.html' });
  });
  
  // Load and display history
  loadHistory();
  
  function loadHistory() {
    chrome.storage.local.get(['captureHistory'], function(result) {
      const history = result.captureHistory || [];
      
      if (history.length === 0) {
        historyItems.innerHTML = '<div class="empty-history">No captures yet</div>';
        return;
      }
      
      // Clear history container
      historyItems.innerHTML = '';
      
      // Display recent history items (latest first)
      history.slice(0, 5).forEach(function(item) {
        const historyItem = document.createElement('div');
        historyItem.className = 'history-item';
        historyItem.dataset.id = item.id;
        
        const truncatedText = item.detectedText ? 
          (item.detectedText.length > 40 ? item.detectedText.substring(0, 40) + '...' : item.detectedText) : 
          'Capture #' + item.id;
        
        historyItem.innerHTML = `
          <img class="history-item-img" src="${item.thumbnailUrl}" alt="Capture thumbnail">
          <div class="history-item-content">
            <div class="history-item-title">${truncatedText}</div>
            <div class="history-item-date">${formatDate(item.timestamp)}</div>
          </div>
        `;
        
        historyItem.addEventListener('click', function() {
          chrome.tabs.create({ url: 'view.html?id=' + item.id });
        });
        
        historyItems.appendChild(historyItem);
      });
    });
  }
  
  function formatDate(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
});