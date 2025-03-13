// Initialize extension
chrome.runtime.onInstalled.addListener(function() {
  // Set default settings
  chrome.storage.sync.get(['aiEnabled', 'stepsEnabled', 'apiKey'], function(result) {
    if (result.aiEnabled === undefined) {
      chrome.storage.sync.set({ aiEnabled: true });
    }
    if (result.stepsEnabled === undefined) {
      chrome.storage.sync.set({ stepsEnabled: true });
    }
    
    // Add context menu option
    chrome.contextMenus.create({
      id: "explainSnap",
      title: "Explain with ExplainSnap",
      contexts: ["all"]
    });
  });
});

// Listen for messages from popup or content scripts
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === 'initiate_capture') {
    initiateScreenCapture(request.options);
  } else if (request.action === 'save_capture') {
    saveCapture(request.captureData, sender.tab.id);
  } else if (request.action === 'analyze_image') {
    analyzeImage(request.imageData, request.options)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ error: error.message }));
    return true; // Required for async sendResponse
  }
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(function(info, tab) {
  if (info.menuItemId === "explainSnap") {
    chrome.storage.sync.get(['aiEnabled', 'stepsEnabled'], function(result) {
      initiateScreenCapture({
        aiEnabled: result.aiEnabled,
        stepsEnabled: result.stepsEnabled
      });
    });
  }
});

// Function to initiate screen capture
function initiateScreenCapture(options) {
  // Inject the capture UI into the current tab
  chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
    const activeTab = tabs[0];
    if (activeTab) {
      chrome.scripting.executeScript({
        target: { tabId: activeTab.id },
        func: injectCaptureUI,
        args: [options]
      });
    }
  });
}

// Function that will be injected into the page
function injectCaptureUI(options) {
  // Check if the capture UI is already injected
  if (document.getElementById('explainsnap-capture-ui')) {
    return;
  }
  
  // Create the capture UI container
  const captureUIContainer = document.createElement('div');
  captureUIContainer.id = 'explainsnap-capture-ui';
  captureUIContainer.style.position = 'fixed';
  captureUIContainer.style.top = '0';
  captureUIContainer.style.left = '0';
  captureUIContainer.style.width = '100%';
  captureUIContainer.style.height = '100%';
  captureUIContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.3)';
  captureUIContainer.style.zIndex = '2147483647'; // Max z-index
  captureUIContainer.style.cursor = 'crosshair';
  
  // Create selection overlay
  const selectionOverlay = document.createElement('div');
  selectionOverlay.id = 'explainsnap-selection-overlay';
  selectionOverlay.style.position = 'absolute';
  selectionOverlay.style.border = '2px dashed white';
  selectionOverlay.style.display = 'none';
  selectionOverlay.style.pointerEvents = 'none';
  
  // Add instruction text
  const instructionText = document.createElement('div');
  instructionText.textContent = 'Click and drag to select an area to capture';
  instructionText.style.position = 'fixed';
  instructionText.style.top = '20px';
  instructionText.style.left = '50%';
  instructionText.style.transform = 'translateX(-50%)';
  instructionText.style.padding = '8px 16px';
  instructionText.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
  instructionText.style.color = 'white';
  instructionText.style.borderRadius = '4px';
  instructionText.style.fontSize = '14px';
  instructionText.style.fontWeight = 'bold';
  instructionText.style.zIndex = '2147483648';
  
  // Add elements to the DOM
  captureUIContainer.appendChild(selectionOverlay);
  document.body.appendChild(captureUIContainer);
  document.body.appendChild(instructionText);
  
  // Variables to track selection
  let isSelecting = false;
  let startX, startY;
  
  // Mouse event handlers
  captureUIContainer.addEventListener('mousedown', function(e) {
    // Start selection
    isSelecting = true;
    startX = e.clientX;
    startY = e.clientY;
    
    selectionOverlay.style.display = 'block';
    selectionOverlay.style.left = startX + 'px';
    selectionOverlay.style.top = startY + 'px';
    selectionOverlay.style.width = '0';
    selectionOverlay.style.height = '0';
  });
  
  captureUIContainer.addEventListener('mousemove', function(e) {
    if (!isSelecting) return;
    
    const currentX = e.clientX;
    const currentY = e.clientY;
    
    // Calculate width and height while handling negative values
    const width = Math.abs(currentX - startX);
    const height = Math.abs(currentY - startY);
    
    // Calculate top-left position for the overlay
    const left = Math.min(startX, currentX);
    const top = Math.min(startY, currentY);
    
    // Update overlay position and size
    selectionOverlay.style.left = left + 'px';
    selectionOverlay.style.top = top + 'px';
    selectionOverlay.style.width = width + 'px';
    selectionOverlay.style.height = height + 'px';
  });
  
  captureUIContainer.addEventListener('mouseup', function(e) {
    if (!isSelecting) return;
    isSelecting = false;
    
    // Get the final selection dimensions
    const left = parseInt(selectionOverlay.style.left);
    const top = parseInt(selectionOverlay.style.top);
    const width = parseInt(selectionOverlay.style.width);
    const height = parseInt(selectionOverlay.style.height);
    
    // Minimum size check
    if (width < 10 || height < 10) {
      // Selection too small, clean up and return
      document.body.removeChild(captureUIContainer);
      document.body.removeChild(instructionText);
      return;
    }
    
    // Capture the selected area
    captureSelectedArea(left, top, width, height, options);
    
    // Clean up
    document.body.removeChild(captureUIContainer);
    document.body.removeChild(instructionText);
  });
  
  // Keyboard event handler to cancel capture
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      document.body.removeChild(captureUIContainer);
      document.body.removeChild(instructionText);
    }
  });
  
  // Function to capture the selected area
  function captureSelectedArea(left, top, width, height, options) {
    // Get the device pixel ratio
    const dpr = window.devicePixelRatio;
    
    // Create a canvas element
    const canvas = document.createElement('canvas');
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    
    // Create a temporary html2canvas to capture the selected area
    // This is just a conceptual representation - in a real extension you'd use the chrome.tabs.captureVisibleTab API
    
    // Simulate capture for this example - in a real extension this would be handled differently
    setTimeout(() => {
      // Convert canvas to base64 image data
      const captureData = {
        imageData: canvas.toDataURL('image/png'),
        left: left,
        top: top,
        width: width,
        height: height,
        timestamp: Date.now(),
        options: options
      };
      
      // Send capture data to background script
      chrome.runtime.sendMessage({
        action: 'save_capture',
        captureData: captureData
      });
      
      // Show "processing" message
      const processingMsg = document.createElement('div');
      processingMsg.textContent = 'Processing your capture...';
      processingMsg.style.position = 'fixed';
      processingMsg.style.top = '50%';
      processingMsg.style.left = '50%';
      processingMsg.style.transform = 'translate(-50%, -50%)';
      processingMsg.style.padding = '20px';
      processingMsg.style.backgroundColor = 'white';
      processingMsg.style.border = '1px solid #ccc';
      processingMsg.style.borderRadius = '8px';
      processingMsg.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
      processingMsg.style.zIndex = '2147483647';
      document.body.appendChild(processingMsg);
      
      // Remove message after 2 seconds
      setTimeout(() => {
        document.body.removeChild(processingMsg);
      }, 2000);
    }, 200);
  }
}

// Function to save the capture
function saveCapture(captureData, tabId) {
  // Generate unique ID for this capture
  const captureId = Date.now().toString();
  
  // Create thumbnail from the captured image
  createThumbnail(captureData.imageData)
    .then(thumbnailUrl => {
      // Prepare capture item for storage
      const captureItem = {
        id: captureId,
        imageUrl: captureData.imageData,
        thumbnailUrl: thumbnailUrl,
        timestamp: captureData.timestamp,
        detectedText: null, // Will be populated after OCR
        explanation: null, // Will be populated after AI analysis
        steps: null // Will be populated after AI analysis
      };
      
      // Save to storage
      chrome.storage.local.get(['captureHistory'], function(result) {
        const history = result.captureHistory || [];
        history.unshift(captureItem); // Add to beginning of array
        
        // Limit history to 30 items
        if (history.length > 30) {
          history.pop();
        }
        
        chrome.storage.local.set({ captureHistory: history }, function() {
          // If AI is enabled, analyze the image
          if (captureData.options.aiEnabled) {
            analyzeImage(captureData.imageData, captureData.options)
              .then(result => {
                // Update storage with analysis results
                chrome.storage.local.get(['captureHistory'], function(data) {
                  const updatedHistory = data.captureHistory;
                  const captureIndex = updatedHistory.findIndex(item => item.id === captureId);
                  
                  if (captureIndex !== -1) {
                    updatedHistory[captureIndex].detectedText = result.detectedText;
                    updatedHistory[captureIndex].explanation = result.explanation;
                    if (captureData.options.stepsEnabled) {
                      updatedHistory[captureIndex].steps = result.steps;
                    }
                    
                    chrome.storage.local.set({ captureHistory: updatedHistory });
                  }
                });
              })
              .catch(error => {
                console.error('Image analysis error:', error);
              });
          }
          
          // Open the view page for this capture
          chrome.tabs.create({ url: 'view.html?id=' + captureId });
        });
      });
    });
}

// Function to create a thumbnail from an image
function createThumbnail(imageDataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = function() {
      // Create thumbnail canvas
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      // Calculate thumbnail dimensions (max 120px)
      const maxSize = 120;
      let width = img.width;
      let height = img.height;
      
      if (width > height) {
        if (width > maxSize) {
          height *= maxSize / width;
          width = maxSize;
        }
      } else {
        if (height > maxSize) {
          width *= maxSize / height;
          height = maxSize;
        }
      }
      
      canvas.width = width;
      canvas.height = height;
      
      // Draw image on canvas
      ctx.drawImage(img, 0, 0, width, height);
      
      // Get thumbnail as data URL
      resolve(canvas.toDataURL('image/jpeg', 0.7)); // Use JPEG for smaller size
    };
    
    img.src = imageDataUrl;
  });
}

// Function to analyze the image with OCR and AI
function analyzeImage(imageData, options) {
  return new Promise((resolve, reject) => {
    // In a real extension, this would call an OCR service and an AI API
    // For this example, we'll simulate the process
    
    // Simulate OCR processing time
    setTimeout(() => {
      // For demo purposes, we'll respond with simulated data
      // In a real extension, you would call Google Cloud Vision API, Tesseract.js, or a similar OCR service
      // Then use an AI API like OpenAI or a similar service for the explanation
      
      // Simulate detected text based on the image (could be math, science, etc.)
      const detectedText = "What value of a is a solution to this equation? 9 + a = 17";
      
      // Simulate AI explanation
      const explanation = "To solve this equation, we need to find the value of 'a' that makes the equation true. We have 9 + a = 17, so we need to isolate 'a' by subtracting 9 from both sides.";
      
      // Simulate step-by-step breakdown if enabled
      let steps = null;
      if (options.stepsEnabled) {
        steps = [
          {
            step: 1,
            description: "Start with the original equation",
            equation: "9 + a = 17"
          },
          {
            step: 2,
            description: "Subtract 9 from both sides to isolate a",
            equation: "9 + a - 9 = 17 - 9"
          },
          {
            step: 3,
            description: "Simplify the left side",
            equation: "a = 17 - 9"
          },
          {
            step: 4,
            description: "Calculate the right side",
            equation: "a = 8"
          },
          {
            step: 5,
            description: "Verify the solution by substituting back into the original equation",
            equation: "9 + 8 = 17 ✓"
          }
        ];
      }
      
      resolve({
        detectedText: detectedText,
        explanation: explanation,
        steps: steps
      });
    }, 1500); // Simulate processing time
  });
}