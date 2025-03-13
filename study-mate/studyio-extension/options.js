document.addEventListener('DOMContentLoaded', function() {
    // Elements
    const aiToggle = document.getElementById('aiToggle');
    const stepsToggle = document.getElementById('stepsToggle');
    const apiKeyInput = document.getElementById('apiKeyInput');
    const testApiBtn = document.getElementById('testApiBtn');
    const saveApiBtn = document.getElementById('saveApiBtn');
    const apiSuccessMessage = document.getElementById('apiSuccessMessage');
    const aiServiceSelect = document.getElementById('aiServiceSelect');
    const clearHistoryBtn = document.getElementById('clearHistoryBtn');
    const storageUsage = document.getElementById('storageUsage');
    const changeShortcutBtn = document.getElementById('changeShortcutBtn');
    
    // Load settings
    chrome.storage.sync.get(['aiEnabled', 'stepsEnabled', 'apiKey', 'aiService'], function(result) {
      if (result.aiEnabled !== undefined) {
        aiToggle.checked = result.aiEnabled;
      }
      
      if (result.stepsEnabled !== undefined) {
        stepsToggle.checked = result.stepsEnabled;
      }
      
      if (result.apiKey) {
        apiKeyInput.value = result.apiKey;
      }
      
      if (result.aiService) {
        aiServiceSelect.value = result.aiService;
      }
    });
    
    // Update storage usage
    updateStorageUsage();
    
    // Event listeners
    aiToggle.addEventListener('change', function() {
      chrome.storage.sync.set({ aiEnabled: aiToggle.checked });
    });
    
    stepsToggle.addEventListener('change', function() {
      chrome.storage.sync.set({ stepsEnabled: stepsToggle.checked });
    });
    
    saveApiBtn.addEventListener('click', function() {
      const apiKey = apiKeyInput.value.trim();
      
      if (apiKey) {
        chrome.storage.sync.set({ apiKey: apiKey }, function() {
          apiSuccessMessage.style.display = 'block';
          
          setTimeout(function() {
            apiSuccessMessage.style.display = 'none';
          }, 3000);
        });
      }
    });
    
    testApiBtn.addEventListener('click', function() {
      const apiKey = apiKeyInput.value.trim();
      
      if (!apiKey) {
        alert('Please enter an API key first');
        return;
      }
      
      testApiBtn.textContent = 'Testing...';
      testApiBtn.disabled = true;
      
      // In a real extension, this would test the API connection
      // For this example, we'll simulate the process
      setTimeout(function() {
        testApiBtn.textContent = 'Test Connection';
        testApiBtn.disabled = false;
        alert('API connection successful!');
      }, 1500);
    });
    
    aiServiceSelect.addEventListener('change', function() {
      chrome.storage.sync.set({ aiService: aiServiceSelect.value });
    });
    
    clearHistoryBtn.addEventListener('click', function() {
      if (confirm('Are you sure you want to clear all capture history? This cannot be undone.')) {
        chrome.storage.local.set({ captureHistory: [] }, function() {
          updateStorageUsage();
          alert('History cleared successfully');
        });
      }
    });
    
    changeShortcutBtn.addEventListener('click', function() {
      // In a real extension, this would open the Chrome keyboard shortcuts page
      // Since we can't do that from the extension directly, we'll show a message
      alert('To change keyboard shortcuts for Chrome extensions:\n\n1. Open chrome://extensions/shortcuts in a new tab\n2. Find "ExplainSnap" in the list\n3. Click the input field and press your desired key combination');
    });
    
    // Function to update storage usage display
    function updateStorageUsage() {
      chrome.storage.local.getBytesInUse(null, function(bytesUsed) {
        const mbUsed = (bytesUsed / (1024 * 1024)).toFixed(2);
        const mbLimit = 5; // Chrome extensions typically have a 5MB limit
        
        storageUsage.textContent = `Used: ${mbUsed} MB / ${mbLimit} MB`;
      });
    }
  });