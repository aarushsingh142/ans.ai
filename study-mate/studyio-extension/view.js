document.addEventListener('DOMContentLoaded', function() {
    // Get elements
    const captureImage = document.getElementById('captureImage');
    const detectedText = document.getElementById('detectedText');
    const explanation = document.getElementById('explanation');
    const stepsSection = document.getElementById('stepsSection');
    const steps = document.getElementById('steps');
    const loadingOverlay = document.getElementById('loadingOverlay');
    const exportBtn = document.getElementById('exportBtn');
    const copyBtn = document.getElementById('copyBtn');
    const shareBtn = document.getElementById('shareBtn');
    const backBtn = document.getElementById('backBtn');
    const newCaptureBtn = document.getElementById('newCaptureBtn');
    const exportModal = document.getElementById('exportModal');
    const closeExportBtn = document.getElementById('closeExportBtn');
    const cancelExportBtn = document.getElementById('cancelExportBtn');
    const confirmExportBtn = document.getElementById('confirmExportBtn');
    
    // Get capture ID from URL
    const urlParams = new URLSearchParams(window.location.search);
    const captureId = urlParams.get('id');
    
    if (!captureId) {
      showError('No capture ID provided');
      return;
    }
    
    // Load capture data
    loadCaptureData(captureId);
    
    // Event listeners
    backBtn.addEventListener('click', function() {
      window.close();
    });
    
    newCaptureBtn.addEventListener('click', function() {
      chrome.runtime.sendMessage({
        action: 'initiate_capture',
        options: {
          aiEnabled: true,
          stepsEnabled: true
        }
      });
      window.close();
    });
    
    exportBtn.addEventListener('click', function() {
      exportModal.style.display = 'flex';
    });
    
    closeExportBtn.addEventListener('click', function() {
      exportModal.style.display = 'none';
    });
    
    cancelExportBtn.addEventListener('click', function() {
      exportModal.style.display = 'none';
    });
    
    confirmExportBtn.addEventListener('click', function() {
      const exportType = document.querySelector('input[name="exportType"]:checked').value;
      const format = document.getElementById('formatSelect').value;
      exportCapture(captureId, exportType, format);
      exportModal.style.display = 'none';
    });
    
    copyBtn.addEventListener('click', function() {
      copyToClipboard();
    });
    
    shareBtn.addEventListener('click', function() {
      shareCapture();
    });
    
    // Close modal when clicking outside
    window.addEventListener('click', function(event) {
      if (event.target === exportModal) {
        exportModal.style.display = 'none';
      }
    });
    
    // Function to load capture data
    function loadCaptureData(id) {
      chrome.storage.local.get(['captureHistory'], function(result) {
        const history = result.captureHistory || [];
        const captureItem = history.find(item => item.id === id);
        
        if (!captureItem) {
          showError('Capture not found');
          return;
        }
        
        // Display capture data
        captureImage.src = captureItem.imageUrl;
        
        if (captureItem.detectedText) {
          detectedText.textContent = captureItem.detectedText;
        } else {
          detectedText.innerHTML = '<em>No text detected</em>';
        }
        
        if (captureItem.explanation) {
          explanation.textContent = captureItem.explanation;
        } else {
          explanation.innerHTML = '<em>No explanation available</em>';
        }
        
        // Handle steps if available
        if (captureItem.steps && captureItem.steps.length > 0) {
          steps.innerHTML = '';
          captureItem.steps.forEach(step => {
            const stepItem = document.createElement('div');
            stepItem.className = 'step-item';
            
            stepItem.innerHTML = `
              <div class="step-number">${step.step}</div>
              <div class="step-content">
                <div class="step-description">${step.description}</div>
                <div class="step-equation">${step.equation}</div>
              </div>
            `;
            
            steps.appendChild(stepItem);
          });
        } else {
          stepsSection.style.display = 'none';
        }
        
        // Hide loading overlay
        loadingOverlay.style.display = 'none';
        
        // Set page title
        const shortText = captureItem.detectedText ? 
          (captureItem.detectedText.length > 50 ? captureItem.detectedText.substring(0, 50) + '...' : captureItem.detectedText) : 
          'Capture #' + captureItem.id;
        document.title = 'ExplainSnap - ' + shortText;
      });
    }
    
    // Function to show error message
    function showError(message) {
      loadingOverlay.innerHTML = `
        <svg viewBox="0 0 24 24" width="50" height="50" style="fill: #e74c3c; margin-bottom: 20px;">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
        </svg>
        <div class="loading-text">Error: ${message}</div>
        <button class="footer-btn" style="margin-top: 20px;" onclick="window.close()">Close</button>
      `;
    }
    
    // Function to copy to clipboard
    function copyToClipboard() {
      const textToCopy = detectedText.textContent + '\n\n' + explanation.textContent;
      
      navigator.clipboard.writeText(textToCopy).then(function() {
        showNotification('Copied to clipboard!');
      }).catch(function() {
        showNotification('Failed to copy to clipboard', false);
      });
    }
    
    // Function to share capture
    function shareCapture() {
      // This is a simplified version. In a real extension,
      // you might want to implement sharing via email, social media, etc.
      if (navigator.share) {
        navigator.share({
          title: document.title,
          text: detectedText.textContent,
          // In a real extension, you might generate a shareable link
          // url: 'https://explainsnap.example.com/share/' + captureId
        }).then(() => {
          showNotification('Shared successfully!');
        }).catch((error) => {
          showNotification('Error sharing: ' + error, false);
        });
      } else {
        copyToClipboard();
        showNotification('Sharing not available. Copied to clipboard instead.');
      }
    }
    
    // Function to export capture
    function exportCapture(id, type, format) {
      // In a real extension, this would handle exporting to different formats
      // For this example, we'll simulate the process
      showNotification('Preparing export...');
      
      setTimeout(() => {
        showNotification('Export complete! File saved to downloads.');
      }, 1500);
    }
    
    // Function to show notification
    function showNotification(message, success = true) {
      const notification = document.createElement('div');
      notification.style.position = 'fixed';
      notification.style.bottom = '20px';
      notification.style.left = '50%';
      notification.style.transform = 'translateX(-50%)';
      notification.style.padding = '10px 20px';
      notification.style.backgroundColor = success ? '#9b59b6' : '#e74c3c';
      notification.style.color = 'white';
      notification.style.borderRadius = '4px';
      notification.style.boxShadow = '0 2px 10px rgba(0,0,0,0.2)';
      notification.style.zIndex = '1000';
      notification.style.transition = 'opacity 0.3s ease-in-out';
      notification.textContent = message;
      
      document.body.appendChild(notification);
      
      setTimeout(() => {
        notification.style.opacity = '0';
        setTimeout(() => {
          document.body.removeChild(notification);
        }, 300);
      }, 3000);
    }
  });