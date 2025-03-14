// background.js - Background script for ExplainSnap extension

// Initialize extension
console.log("Background script loaded and executing");

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

// Track active tabs to handle context invalidation
const activeTabsMap = new Map();

// Listen for tab updates to track active tabs
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && tab.url.startsWith('http')) {
    activeTabsMap.set(tabId, tab.url);
  }
});

// Clean up when tabs are closed
chrome.tabs.onRemoved.addListener((tabId) => {
  activeTabsMap.delete(tabId);
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

// Listen for messages from popup or content scripts
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  try {
    if (request.action === 'initiate_capture') {
      initiateScreenCapture(request.options);
      sendResponse({ success: true });
    } else if (request.action === 'save_capture') {
      saveCapture(request.captureData, sender.tab?.id || -1)
        .then(result => sendResponse({ success: true, result }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true; // Required for async sendResponse
    } else if (request.action === 'analyze_image') {
      analyzeImage(request.imageData, request.options)
        .then(result => sendResponse({ success: true, result }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true; // Required for async sendResponse
    } else if (request.action === 'check_extension_health') {
      // Used by content scripts to verify extension is still valid
      sendResponse({ valid: true });
    }
    else if (request.action === 'take_screenshot') {
      try {
        chrome.tabs.captureVisibleTab(null, {format: 'png'}, function(dataUrl) {
          if (chrome.runtime.lastError) {
            sendResponse({ 
              success: false, 
              error: chrome.runtime.lastError.message 
            });
            return;
          }
          
          // Make sure dataUrl is valid
          if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image')) {
            sendResponse({ 
              success: false, 
              error: "Invalid screenshot data returned" 
            });
            return;
          }
          
          // Crop the image to the selected area
          cropImage(dataUrl, request.area).then(croppedDataUrl => {
            // Send back the properly formatted response
            sendResponse({ 
              success: true, 
              dataUrl: croppedDataUrl  // Send the cropped image
            });
          }).catch(error => {
            sendResponse({
              success: false,
              error: "Error cropping image: " + error.message
            });
          });
        });
        
        return true; // Required for async sendResponse
      } catch (error) {
        console.error("Error capturing screenshot:", error);
        sendResponse({
          success: false, 
          error: error.message
        });
        return true;
      }
    }
  } catch (error) {
    console.error("Error processing message:", error);
    sendResponse({ success: false, error: error.message });
  }
  return true; // Required for async sendResponse
});

// Function to initiate screen capture
function initiateScreenCapture(options) {
  // Inject the capture UI into the current tab
  chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
    const activeTab = tabs[0];
    if (activeTab && activeTab.id) {
      try {
        chrome.scripting.executeScript({
          target: { tabId: activeTab.id },
          function: injectCaptureUI,
          args: [options]
        }).catch(error => {
          console.error("Failed to inject capture UI:", error);
          // If injection fails, could be permissions issue
          if (error.message.includes("Cannot access")) {
            // Show notification about permissions
            chrome.notifications.create({
              type: "basic",
              iconUrl: "images/icon128.png",
              title: "ExplainSnap Permission Required",
              message: "ExplainSnap needs permission to access this page. Try on a different page or check extension permissions."
            });
          }
        });
      } catch (error) {
        console.error("Error initiating screen capture:", error);
      }
    }
  });
}

// Function to crop an image to a specified area
function cropImage(dataUrl, area) {
  return new Promise((resolve, reject) => {
    try {
      // Create an offscreen canvas
      const offscreen = new OffscreenCanvas(area.width, area.height);
      const ctx = offscreen.getContext('2d');
      
      // Load image data
      const blob = dataURItoBlob(dataUrl);
      createImageBitmap(blob).then(imageBitmap => {
        // Calculate the scaling factor based on device pixel ratio
        const dpr = area.dpr || 1;
        
        // Draw only the selected portion to the canvas
        ctx.drawImage(
          imageBitmap,
          area.x * dpr, area.y * dpr,  // Source coordinates (scaled by DPR)
          area.width * dpr, area.height * dpr,  // Source dimensions (scaled by DPR)
          0, 0,  // Destination coordinates
          area.width, area.height  // Destination dimensions
        );
        
        // Convert to data URL
        offscreen.convertToBlob({ type: 'image/png' })
          .then(blob => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
      }).catch(reject);
    } catch (error) {
      reject(error);
    }
  });
}

// Function that will be injected into the page
function injectCaptureUI(options) {
  // Helper function to check if extension context is valid
  function isExtensionContextValid() {
    return typeof chrome !== 'undefined' && chrome.runtime && !!chrome.runtime.id;
  }
  
  // Check if the extension context is valid
  if (!isExtensionContextValid()) {
    alert("ExplainSnap extension context is invalid. Please refresh the page and try again.");
    return;
  }
  
  // First perform a health check to ensure communication is working
  chrome.runtime.sendMessage({ action: 'check_extension_health' }, function(response) {
    if (chrome.runtime.lastError || !response || !response.valid) {
      console.error("Extension health check failed:", chrome.runtime.lastError);
      alert("ExplainSnap extension is not responding. Please refresh the page and try again.");
      return;
    }
    
    // Continue with UI injection if health check passes
    createCaptureUI();
  });
  
  function createCaptureUI() {
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
    
    // Add cancel button
    const cancelButton = document.createElement('div');
    cancelButton.textContent = 'Cancel (ESC)';
    cancelButton.style.position = 'fixed';
    cancelButton.style.bottom = '20px';
    cancelButton.style.right = '20px';
    cancelButton.style.padding = '8px 16px';
    cancelButton.style.backgroundColor = 'rgba(255, 0, 0, 0.7)';
    cancelButton.style.color = 'white';
    cancelButton.style.borderRadius = '4px';
    cancelButton.style.fontSize = '14px';
    cancelButton.style.cursor = 'pointer';
    cancelButton.style.zIndex = '2147483648';
    
    // Add elements to the DOM
    captureUIContainer.appendChild(selectionOverlay);
    document.body.appendChild(captureUIContainer);
    document.body.appendChild(instructionText);
    document.body.appendChild(cancelButton);
    
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
        cleanup();
        return;
      }
      
      // Capture the selected area
      captureSelectedArea(left, top, width, height, options);
      
      // Clean up
      cleanup();
    });
    
    // Cancel button event handler
    cancelButton.addEventListener('click', function() {
      cleanup();
    });
    
    // Keyboard event handler to cancel capture
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        cleanup();
      }
    }
    
    document.addEventListener('keydown', handleKeyDown);
    
    // Function to clean up UI elements
    function cleanup() {
      document.body.removeChild(captureUIContainer);
      document.body.removeChild(instructionText);
      document.body.removeChild(cancelButton);
      document.removeEventListener('keydown', handleKeyDown);
    }
    
    // Function to capture the selected area
    function captureSelectedArea(left, top, width, height, options) {
      // Show "processing" message
      const processingMsg = document.createElement('div');
      processingMsg.id = 'explainsnap-processing-msg';
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
      
      // Get the device pixel ratio
      const dpr = window.devicePixelRatio;
      
      // Verify extension context before proceeding
      if (!isExtensionContextValid()) {
        showError("Extension context is no longer valid. Please refresh the page and try again.");
        return;
      }
      
      // Request screenshot using chrome API through background script
      try {
        chrome.runtime.sendMessage(
          { 
            action: 'take_screenshot',
            area: {
              x: left,
              y: top,
              width: width,
              height: height,
              dpr: dpr
            },
            options: options
          }, 
          function(response) {
            console.log("response received:", response);
            if (chrome.runtime.lastError) {
              console.error("Error taking screenshot:", chrome.runtime.lastError);
              showError("Failed to capture screenshot: " + chrome.runtime.lastError.message);
              return;
            }
            
            if (!response || !response.success) {
              showError("Screenshot failed: " + (response?.error || "Unknown error"));
              return;
            }
            
            // Process the screenshot data
            const captureData = {
              imageData: response.dataUrl,  // Use the image data from the background script
              left: left,
              top: top,
              width: width,
              height: height,
              timestamp: Date.now(),
              options: options
            };
            
            // Send capture data to background script for saving
            try {
              chrome.runtime.sendMessage(
                {
                  action: 'save_capture',
                  captureData: captureData
                },
                function(saveResponse) {
                  console.log("Save response received:", saveResponse);
                  // Remove processing message
                  if (document.body.contains(processingMsg)) {
                    document.body.removeChild(processingMsg);
                  }
                  
                  if (chrome.runtime.lastError) {
                    console.error("Error saving capture:", chrome.runtime.lastError);
                    showError("Failed to save capture: " + chrome.runtime.lastError.message);
                    return;
                  }
                  
                  if (!saveResponse || !saveResponse.success) {
                    showError("Failed to process capture: " + (saveResponse?.error || "Unknown error"));
                  }
                }
              );
            } catch (error) {
              console.error("Exception sending save_capture message:", error);
              showError("Error saving capture: " + error.message);
              
              // Remove processing message if it exists
              if (document.body.contains(processingMsg)) {
                document.body.removeChild(processingMsg);
              }
            }
          }
        );
      } catch (error) {
        console.error("Exception in captureSelectedArea:", error);
        showError("Error: " + error.message);
        
        // Remove processing message if it exists
        if (document.body.contains(processingMsg)) {
          document.body.removeChild(processingMsg);
        }
      }
      
      // Error handler function - Keep your existing showError function
      function showError(message) {
        // Remove processing message if exists
        const processingMsg = document.getElementById('explainsnap-processing-msg');
        if (processingMsg && document.body.contains(processingMsg)) {
          document.body.removeChild(processingMsg);
        }
        
        // Show error message
        const errorMsg = document.createElement('div');
        errorMsg.textContent = message;
        errorMsg.style.position = 'fixed';
        errorMsg.style.top = '50%';
        errorMsg.style.left = '50%';
        errorMsg.style.transform = 'translate(-50%, -50%)';
        errorMsg.style.padding = '20px';
        errorMsg.style.backgroundColor = 'white';
        errorMsg.style.border = '2px solid red';
        errorMsg.style.borderRadius = '8px';
        errorMsg.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
        errorMsg.style.zIndex = '2147483647';
        errorMsg.style.maxWidth = '80%';
        document.body.appendChild(errorMsg);
        
        // Remove error message after 4 seconds
        setTimeout(() => {
          if (document.body.contains(errorMsg)) {
            document.body.removeChild(errorMsg);
          }
        }, 4000);
      }
    }
  }
}

// Function to save the capture
async function saveCapture(captureData, tabId) {
  try {
    // Generate unique ID for this capture
    const captureId = Date.now().toString();
    
    // Create thumbnail from the captured image
    const thumbnailUrl = await createThumbnail(captureData.imageData);
    
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
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(['captureHistory'], function(result) {
        if (chrome.runtime.lastError) {
          return reject(new Error("Failed to access storage: " + chrome.runtime.lastError.message));
        }
        
        const history = result.captureHistory || [];
        history.unshift(captureItem); // Add to beginning of array
        
        // Limit history to 30 items
        if (history.length > 30) {
          history.pop();
        }
        
        chrome.storage.local.set({ captureHistory: history }, function() {
          if (chrome.runtime.lastError) {
            return reject(new Error("Failed to save to storage: " + chrome.runtime.lastError.message));
          }
          
          // If AI is enabled, analyze the image
          if (captureData.options.aiEnabled) {
            analyzeImage(captureData.imageData, captureData.options)
              .then(result => {
                // Update storage with analysis results
                chrome.storage.local.get(['captureHistory'], function(data) {
                  if (chrome.runtime.lastError) {
                    console.error("Error getting capture history:", chrome.runtime.lastError);
                    return;
                  }
                  
                  const updatedHistory = data.captureHistory;
                  const captureIndex = updatedHistory.findIndex(item => item.id === captureId);
                  
                  if (captureIndex !== -1) {
                    updatedHistory[captureIndex].detectedText = result.detectedText;
                    updatedHistory[captureIndex].explanation = result.explanation;
                    if (captureData.options.stepsEnabled) {
                      updatedHistory[captureIndex].steps = result.steps;
                    }
                    
                    chrome.storage.local.set({ captureHistory: updatedHistory }, function() {
                      if (chrome.runtime.lastError) {
                        console.error("Error updating capture history:", chrome.runtime.lastError);
                      } else {
                        console.log("Storage updated with analysis results");
                      }
                    });
                  }
                });
              })
              .catch(error => {
                console.error('Image analysis error:', error);
              });
          }
          
          // Open the view page for this capture
          chrome.tabs.create({ url: 'view.html?id=' + captureId }, function(tab) {
            if (chrome.runtime.lastError) {
              console.error("Error opening view page:", chrome.runtime.lastError);
              return reject(new Error("Failed to open view page: " + chrome.runtime.lastError.message));
            }
            resolve(captureId);
          });
        });
      });
    });
  } catch (error) {
    console.error("Error in saveCapture:", error);
    throw error;
  }
}

// Function to create a thumbnail from an image
function createThumbnail(imageDataUrl) {
  return new Promise((resolve, reject) => {
    try {
      // Create an offscreen canvas
      const offscreen = new OffscreenCanvas(120, 120);
      const ctx = offscreen.getContext('2d');
      
      // Load image data
      const blob = dataURItoBlob(imageDataUrl);
      createImageBitmap(blob).then(imageBitmap => {
        // Calculate dimensions
        const maxSize = 120;
        let width = imageBitmap.width;
        let height = imageBitmap.height;
        
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
        
        // Set canvas size
        offscreen.width = width;
        offscreen.height = height;
        
        // Draw image and convert to data URL
        ctx.drawImage(imageBitmap, 0, 0, width, height);
        offscreen.convertToBlob({ type: 'image/jpeg', quality: 0.6 })
          .then(blob => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
      }).catch(reject);
    } catch (error) {
      reject(error);
    }
  });
}

// Helper function to convert data URI to Blob
function dataURItoBlob(dataURI) {
  const byteString = atob(dataURI.split(',')[1]);
  const mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0];
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }
  return new Blob([ab], { type: mimeString });
}

// Function to analyze the image with OCR and AI
function analyzeImage(imageData, options) {
  console.log("Starting image analysis", {hasImageData: !!imageData, options});
  
  return new Promise((resolve, reject) => {
    try {
      // In a real extension, this would call an OCR service and an AI API
      // For this example, we'll simulate the process
      
      // Check if API key is available if needed
      chrome.storage.sync.get(['apiKey'], function(result) {
        // Simulate OCR processing time
        setTimeout(() => {
          try {
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
            
            const result = {
              detectedText: detectedText,
              explanation: explanation,
              steps: steps
            };
            
            console.log("Analysis complete, returning result");
            resolve(result);
          } catch (error) {
            console.error("Error during analysis processing:", error);
            reject(error);
          }
        }, 1500); // Simulate processing time
      });
    } catch (error) {
      console.error("Exception in analyzeImage:", error);
      reject(error);
    }
  });
}

// Extension health check - run periodically to verify extension is working
setInterval(function() {
  // Check if any tabs need content script reinjection
  chrome.tabs.query({ active: true }, function(tabs) {
    for (const tab of tabs) {
      if (!tab.id) continue;
      
      // Only try to reinject on http/https pages
      if (!tab.url || !tab.url.match(/^https?:\/\//)) continue;
      
      // Try to send a health check message to the tab
      try {
        chrome.tabs.sendMessage(tab.id, { action: 'extension_health_check' }, function(response) {
          // If there's an error, the content script might need to be reinjected
          if (chrome.runtime.lastError) {
            // Only reinject if we know this tab should have our content script
            if (activeTabsMap.has(tab.id)) {
              console.log("Reinjecting content script in tab", tab.id);
              
              // Reinject content script
              chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['content.js']
              }).catch(error => {
                console.error("Failed to reinject content script:", error);
              });
            }
          }
        });
      } catch (error) {
        console.error("Error checking tab health:", error);
      }
    }
  });
}, 30000); // Check every 30 seconds