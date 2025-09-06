(function ($) {
  "use strict";

  // Suppress specific browser security errors that don't affect functionality
  const originalError = console.error;
  console.error = function(...args) {
    const errorMessage = args[0];
    
    // List of errors to suppress
    const suppressedErrors = [
      'x-rtb-fingerprint-id',
      'Refused to get unsafe header',
      'RTB',
      'fingerprint'
    ];
    
    // Check if this error should be suppressed
    if (typeof errorMessage === 'string') {
      const shouldSuppress = suppressedErrors.some(suppressedError => 
        errorMessage.toLowerCase().includes(suppressedError.toLowerCase())
      );
      
      if (shouldSuppress) {
        return; // Don't log this error
      }
    }
    
    // Log all other errors normally
    originalError.apply(console, args);
  };

  // COUNTER NUMBERS
  jQuery('.counter-thumb').appear(function () {
    jQuery('.counter-number').countTo();
  });

  // Copyright Year
  $(document).ready(function () {
    const currentYear = new Date().getFullYear();
    $('#copyright-text').text(currentYear);
  });

  // FAQ open close
  const questions = document.querySelectorAll('.faq-question');
  questions.forEach(q => {
    q.addEventListener('click', () => {
      q.classList.toggle('active');
      const answer = q.nextElementSibling;
      answer.style.display = answer.style.display === 'block' ? 'none' : 'block';
    });
  });

  // REVIEWS CAROUSEL
  $('.reviews-carousel').owlCarousel({
    items: 2,
    loop: true,
    autoplay: true,
    margin: 30,
    responsive: {
      0: {
        items: 1
      },
      600: {
        items: 1
      },
      1000: {
        items: 2
      }
    }
  })

  // CUSTOM LINK
  $('.smoothscroll').click(function () {
    var el = $(this).attr('href');
    var elWrapped = $(el);
    var header_height = $('.navbar').height();

    scrollToDiv(elWrapped, header_height);
    return false;

    function scrollToDiv(element, navheight) {
      var offset = element.offset();
      var offsetTop = offset.top;
      var totalScroll = offsetTop - navheight;

      $('body,html').animate({
        scrollTop: totalScroll
      }, 300);
    }
  });

})(window.jQuery);

// API Configuration
const API_BASE_URL = 'https://api.nexsphereglobal.com'; 
let employerFormData = {};

// Feature flag to control API calls
const API_ENABLED = true; // Set to true when backend is ready

// Utility Functions
function showMessage(message, type = 'info') {
  const alertClass = type === 'error' ? 'alert-danger' : type === 'success' ? 'alert-success' : 'alert-info';
  const alertHtml = `<div class="alert ${alertClass} alert-dismissible fade show" role="alert">
    ${message}
    <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
  </div>`;
  
  // Try to find an existing alert container or create one
  let alertContainer = document.querySelector('.alert-container');
  if (!alertContainer) {
    alertContainer = document.createElement('div');
    alertContainer.className = 'alert-container position-fixed top-0 start-50 translate-middle-x mt-3';
    alertContainer.style.zIndex = '9999';
    document.body.appendChild(alertContainer);
  }
  
  alertContainer.innerHTML = alertHtml;
  
  // Auto remove after 5 seconds
  setTimeout(() => {
    const alert = alertContainer.querySelector('.alert');
    if (alert) {
      alert.remove();
    }
  }, 5000);
}

// Enhanced error handling for fetch requests
async function makeAPICall(url, options = {}) {
  try {
    // Set default headers
    const defaultHeaders = {
      'Content-Type': 'application/json',
    };
    
    const config = {
      ...options,
      headers: {
        ...defaultHeaders,
        ...(options.headers || {})
      }
    };

    console.log('Making API call to:', url);
    console.log('Request config:', config);

    const response = await fetch(url, config);
    
    console.log('Response status:', response.status);
    // console.log('Response headers:', response.headers);

    // Check if response is ok
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Error response:', errorText);
      throw new Error(`Server error (${response.status}): ${errorText || response.statusText}`);
    }

    // Get response text first
    const responseText = await response.text();
    console.log('Response text:', responseText);

    // Check if response has content
    if (!responseText.trim()) {
      throw new Error('Empty response from server');
    }

    // Try to parse JSON
    try {
      const jsonData = JSON.parse(responseText);
      console.log('Parsed JSON:', jsonData);
      return jsonData;
    } catch (parseError) {
      console.error('JSON parse error:', parseError);
      console.error('Response was:', responseText);
      throw new Error(`Invalid JSON response from server: ${responseText.substring(0, 200)}...`);
    }

  } catch (error) {
    console.error('API call error:', error);
    
    if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
      throw new Error('Cannot connect to server. Please ensure the server is running.');
    }
    
    throw error;
  }
}

// Role selection functionality
function initializeRoleSelection() {
  const employeeBtn = document.getElementById('employeeBtn');
  const employerBtn = document.getElementById('employerBtn');
  const employeeForm = document.getElementById('employeeForm');
  const employerForm = document.getElementById('employerForm');

  if (employeeBtn && employerBtn && employeeForm && employerForm) {
    employeeBtn.addEventListener('click', function() {
      employeeBtn.classList.add('active');
      employerBtn.classList.remove('active');
      employeeForm.style.display = 'block';
      employerForm.style.display = 'none';
    });

    employerBtn.addEventListener('click', function() {
      employerBtn.classList.add('active');
      employeeBtn.classList.remove('active');
      employerForm.style.display = 'block';
      employeeForm.style.display = 'none';
    });
  }
}

// Modal functions
function showLoading(text = 'Processing...') {
  const loadingModal = document.getElementById('loadingModal');
  const loadingText = document.getElementById('loadingText');
  
  if (loadingModal && loadingText) {
    loadingText.textContent = text;
    loadingModal.style.display = 'flex';
  }
}

function hideLoading() {
  const loadingModal = document.getElementById('loadingModal');
  if (loadingModal) {
    loadingModal.style.display = 'none';
  }
}

function showSuccess(content) {
  const successModal = document.getElementById('successModal');
  const successContent = document.getElementById('successContent');
  
  if (successModal && successContent) {
    successContent.innerHTML = content;
    successModal.style.display = 'flex';
  }
}

function closeSuccessModal() {
  const successModal = document.getElementById('successModal');
  if (successModal) {
    successModal.style.display = 'none';
  }
}

function openModal() {
  const consentModal = document.getElementById('consentModal');
  if (consentModal) {
    consentModal.style.display = 'flex';
  }
}

function closeModal() {
  const consentModal = document.getElementById('consentModal');
  if (consentModal) {
    consentModal.style.display = 'none';
  }
}

// Form validation functions
function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function validatePhoneNumber(phone) {
  const phoneRegex = /^(\+91|91)?[6-9]\d{9}$/;
  return phoneRegex.test(phone.replace(/\s+/g, ''));
}

function validateEmployeeForm(data) {
  const errors = [];

  if (!data.name?.trim()) errors.push('Name is required');
  if (!data.email?.trim()) errors.push('Email is required');
  if (!data.contact_no?.trim()) errors.push('Contact number is required');
  if (!data.joining_company?.trim()) errors.push('Joining company is required');
  if (!data.joining_date?.trim()) errors.push('Joining date is required');
  if (!data.position?.trim()) errors.push('Position is required');

  if (data.email && !validateEmail(data.email)) {
    errors.push('Please enter a valid email address');
  }

  if (data.contact_no && !validatePhoneNumber(data.contact_no)) {
    errors.push('Please enter a valid Indian phone number');
  }

  if (data.alternate_no && data.alternate_no.trim() && !validatePhoneNumber(data.alternate_no)) {
    errors.push('Please enter a valid alternate phone number');
  }

  return errors;
}

function validateEmployerForm(data) {
  const errors = [];

  if (!data.name?.trim()) errors.push('Name is required');
  if (!data.company_name?.trim()) errors.push('Company name is required');
  if (!data.business_email?.trim()) errors.push('Business email is required');
  if (!data.business_number?.trim()) errors.push('Business number is required');
  if (!data.location?.trim()) errors.push('Location is required');
  if (!data.designation?.trim()) errors.push('Designation is required');
  if (!data.company_size || data.company_size < 1) errors.push('Valid company size is required');

  if (data.business_email && !validateEmail(data.business_email)) {
    errors.push('Please enter a valid business email address');
  }

  if (data.business_number && !validatePhoneNumber(data.business_number)) {
    errors.push('Please enter a valid Indian business phone number');
  }

  return errors;
}

// Employee form submission
async function handleEmployeeFormSubmit(e) {
  e.preventDefault();
  
  const submitBtn = document.getElementById('employeeSubmitBtn');
  const originalText = submitBtn?.textContent || 'Register Employee';
  
  if (!submitBtn) {
    console.error('Submit button not found');
    return;
  }

  try {
    // Get form data
    const formData = new FormData(e.target);
    const employeeData = Object.fromEntries(formData.entries());

    console.log('Employee form data:', employeeData);

    // Validate form
    const validationErrors = validateEmployeeForm(employeeData);
    if (validationErrors.length > 0) {
      showMessage('Please fix the following errors:<br>• ' + validationErrors.join('<br>• '), 'error');
      return;
    }

    // Check consent
    const consentCheckbox = document.getElementById('employeeConsent');
    if (!consentCheckbox?.checked) {
      showMessage('Please agree to the consent letter before proceeding', 'error');
      return;
    }

    // Check if API is enabled
    if (!API_ENABLED) {
      showMessage('Employee registration is currently being set up. Please check back soon!', 'info');
      return;
    }

    // Disable button and show loading
    submitBtn.disabled = true;
    submitBtn.textContent = 'Registering...';
    showLoading('Registering employee...');

    // Make API call
    const result = await makeAPICall(`${API_BASE_URL}/api/register-employee`, {
      method: 'POST',
      body: JSON.stringify(employeeData)
    });

    hideLoading();

    if (result.success) {
      showSuccess(`
        <div class="success-message">
          <h3>Registration Successful!</h3>
          <p>Employee registered successfully. A confirmation email has been sent to ${employeeData.email}.</p>
          <p><strong>Employee ID:</strong> ${result.employeeId || 'N/A'}</p>
        </div>
      `);
      
      // Reset form
      e.target.reset();
      if (consentCheckbox) consentCheckbox.checked = false;
    } else {
      showMessage('Registration failed: ' + (result.message || 'Unknown error'), 'error');
    }

  } catch (error) {
    hideLoading();
    console.error('Employee registration error:', error);
    showMessage('Registration failed: ' + error.message, 'error');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = originalText;
    }
  }
}

// Employer form submission
async function handleEmployerFormSubmit(e) {
  e.preventDefault();
  
  const submitBtn = document.getElementById('employerSubmitBtn');
  const originalText = submitBtn?.textContent || 'Register & Pay ₹999';
  
  if (!submitBtn) {
    console.error('Submit button not found');
    return;
  }

  try {
    // Get form data
    const formData = new FormData(e.target);
    employerFormData = Object.fromEntries(formData.entries());

    console.log('Employer form data:', employerFormData);

    // Validate form
    const validationErrors = validateEmployerForm(employerFormData);
    if (validationErrors.length > 0) {
      showMessage('Please fix the following errors:<br>• ' + validationErrors.join('<br>• '), 'error');
      return;
    }

    // Check if API is enabled
    if (!API_ENABLED) {
      showMessage('Employer registration is currently being set up. Please check back soon!', 'info');
      return;
    }

    // Disable button and show loading
    submitBtn.disabled = true;
    submitBtn.textContent = 'Processing...';
    showLoading('Creating payment order...');

    let orderData; // Declare orderData in the main scope

    try {
      // Create payment order
      orderData = await makeAPICall(`${API_BASE_URL}/api/employer/create-order`, {
        method: 'POST',
        body: JSON.stringify(employerFormData)
      });
      
      hideLoading(); // Hide loading after successful order creation
      
      // Handle success
      console.log('Order created successfully:', orderData);
      
      // Initialize Razorpay payment
      initiateRazorpayPayment(orderData);
      
    } catch (error) {
      console.error('Failed to create order:', error);
      
      hideLoading(); // Hide loading on error
      
      // Re-enable button
      submitBtn.disabled = false;
      submitBtn.textContent = originalText;
      
      // Show user-friendly error message
      if (error.message.includes('404')) {
        showMessage('Service temporarily unavailable. Please try again later.', 'error');
      } else if (error.message.includes('Cannot connect to server')) {
        showMessage('Cannot connect to server. Please ensure the server is running and try again.', 'error');
      } else {
        showMessage('An error occurred while creating payment order: ' + error.message, 'error');
      }
      
      // Don't proceed to payment if order creation failed
      return;
    }

  } catch (error) {
    hideLoading();
    console.error('Employer form error:', error);
    showMessage('Failed to process form: ' + error.message, 'error');
    
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = originalText;
    }
  }
}

// Initialize Razorpay payment
function initiateRazorpayPayment(orderData) {
  // Check if Razorpay is loaded
  if (typeof Razorpay === 'undefined') {
    showMessage('Payment gateway not loaded. Please refresh the page and try again.', 'error');
    return;
  }

  const options = {
    key: orderData.key,
    amount: orderData.amount,
    currency: orderData.currency || 'INR',
    name: 'Nexsphere Global',
    description: 'Employer Registration Fee',
    order_id: orderData.orderId,
    handler: function(response) {
      handlePaymentSuccess(response);
    },
    prefill: {
      name: employerFormData.name,
      email: employerFormData.business_email,
      contact: employerFormData.business_number?.replace(/\D/g, '').slice(-10) || ''
    },
    theme: {
      color: '#307d73'
    },
    method: {
      upi: true,
      card: true,
      netbanking: true,
      wallet: true,
      paylater: true
    },
    modal: {
      ondismiss: function() {
        const submitBtn = document.getElementById('employerSubmitBtn');
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Register & Pay ₹999';
        }
        showMessage('Payment was cancelled', 'info');
      }
    }
  };

  console.log('Razorpay options:', options);

  try {
    const rzp = new Razorpay(options);
    
    rzp.on('payment.failed', function(response) {
      console.error('Payment failed:', response);
      handlePaymentFailure(response.error);
    });
    
    rzp.open();
  } catch (error) {
    console.error('Error opening Razorpay:', error);
    showMessage('Failed to open payment gateway: ' + error.message, 'error');
  }
}

// Handle successful payment
async function handlePaymentSuccess(response) {
  showLoading('Verifying payment and completing registration...');
  
  try {
    const registrationData = {
      ...employerFormData,
      razorpay_order_id: response.razorpay_order_id,
      razorpay_payment_id: response.razorpay_payment_id,
      razorpay_signature: response.razorpay_signature
    };

    console.log('Payment success data:', registrationData);

    const result = await makeAPICall(`${API_BASE_URL}/api/employer/register`, {
      method: 'POST',
      body: JSON.stringify(registrationData)
    });

    hideLoading();

    if (result.success) {
      showSuccess(`
        <div class="success-message">
          <h3>Registration Successful!</h3>
          <p>Your employer account has been created successfully.</p>
          <p><strong>Company:</strong> ${employerFormData.company_name}</p>
          <p><strong>Payment ID:</strong> ${result.paymentId || response.razorpay_payment_id}</p>
          <p><strong>Employer ID:</strong> ${result.employerId || 'N/A'}</p>
          <p>A confirmation email has been sent to ${employerFormData.business_email}</p>
        </div>
      `);

      // Reset form
      const employerForm = document.getElementById('employerForm');
      if (employerForm) {
        employerForm.reset();
      }
      employerFormData = {};

    } else {
      showMessage('Registration failed: ' + (result.message || 'Unknown error'), 'error');
    }

  } catch (error) {
    hideLoading();
    console.error('Registration error:', error);
    showMessage('Registration failed: ' + error.message, 'error');
  } finally {
    const submitBtn = document.getElementById('employerSubmitBtn');
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Register & Pay ₹999';
    }
  }
}

// Handle payment failure
function handlePaymentFailure(error) {
  console.error('Payment failed:', error);

  let errorMessage = 'Payment failed. Please try again.';

  if (error?.code) {
    switch (error.code) {
      case 'BAD_REQUEST_ERROR':
        errorMessage = 'Invalid payment request. Please try again.';
        break;
      case 'GATEWAY_ERROR':
        errorMessage = 'Payment gateway error. Please try again.';
        break;
      case 'NETWORK_ERROR':
        errorMessage = 'Network error. Please check your connection.';
        break;
      case 'SERVER_ERROR':
        errorMessage = 'Server error. Please try again later.';
        break;
      default:
        errorMessage = error.description || error.reason || errorMessage;
    }
  }

  showMessage(errorMessage, 'error');

  const submitBtn = document.getElementById('employerSubmitBtn');
  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Register & Pay ₹999';
  }
}

// Input validation on change
function initializeInputValidation() {
  // Email validation
  document.querySelectorAll('input[type="email"]').forEach(input => {
    input.addEventListener('blur', function() {
      if (this.value && !validateEmail(this.value)) {
        this.style.borderColor = '#dc3545';
        this.title = 'Please enter a valid email address';
      } else {
        this.style.borderColor = '#ccc';
        this.title = '';
      }
    });
  });

  // Phone number validation
  document.querySelectorAll('input[type="tel"]').forEach(input => {
    input.addEventListener('input', function() {
      // Allow only numbers, +, and spaces
      this.value = this.value.replace(/[^+\d\s]/g, '');
    });

    input.addEventListener('blur', function() {
      if (this.value && !validatePhoneNumber(this.value)) {
        this.style.borderColor = '#dc3545';
        this.title = 'Please enter a valid Indian phone number';
      } else {
        this.style.borderColor = '#ccc';
        this.title = '';
      }
    });
  });

  // Company size validation
  const companySizeInput = document.querySelector('input[name="company_size"]');
  if (companySizeInput) {
    companySizeInput.addEventListener('input', function() {
      if (this.value < 1) {
        this.value = 1;
      }
    });
  }
}

// Close modals when clicking outside
function initializeModalHandlers() {
  window.addEventListener('click', function(event) {
    const consentModal = document.getElementById('consentModal');
    const successModal = document.getElementById('successModal');

    if (event.target === consentModal) {
      closeModal();
    }
    if (event.target === successModal) {
      closeSuccessModal();
    }
    // Note: Don't allow closing loading modal by clicking outside
  });

  // Add close button handlers
  document.addEventListener('click', function(event) {
    if (event.target.classList.contains('close')) {
      const modal = event.target.closest('.modal');
      if (modal) {
        modal.style.display = 'none';
      }
    }
  });
}

// Form auto-save functionality (optional)
function initializeAutoSave() {
  function saveFormData() {
    try {
      const employeeForm = document.getElementById('employeeForm');
      const employerForm = document.getElementById('employerForm');

      if (employeeForm && employeeForm.style.display !== 'none') {
        const formData = new FormData(employeeForm);
        const data = Object.fromEntries(formData.entries());
        sessionStorage.setItem('employeeFormData', JSON.stringify(data));
      }

      if (employerForm && employerForm.style.display !== 'none') {
        const formData = new FormData(employerForm);
        const data = Object.fromEntries(formData.entries());
        sessionStorage.setItem('employerFormData', JSON.stringify(data));
      }
    } catch (error) {
      console.warn('Auto-save failed:', error);
    }
  }

  function loadSavedFormData() {
    try {
      const savedEmployeeData = sessionStorage.getItem('employeeFormData');
      const savedEmployerData = sessionStorage.getItem('employerFormData');

      if (savedEmployeeData) {
        const data = JSON.parse(savedEmployeeData);
        Object.keys(data).forEach(key => {
          const input = document.querySelector(`#employeeForm input[name="${key}"]`);
          if (input && data[key]) input.value = data[key];
        });
      }

      if (savedEmployerData) {
        const data = JSON.parse(savedEmployerData);
        Object.keys(data).forEach(key => {
          const input = document.querySelector(`#employerForm input[name="${key}"]`);
          if (input && data[key]) input.value = data[key];
        });
      }
    } catch (error) {
      console.warn('Auto-load failed:', error);
    }
  }

  // Auto-save on input
  document.addEventListener('input', debounce(saveFormData, 1000));
  
  // Load saved data on page load
  loadSavedFormData();
}

// Debounce function for auto-save
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Initialize everything when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
  console.log('DOM loaded, initializing application...');

  // Initialize all components
  initializeRoleSelection();
  initializeInputValidation();
  initializeModalHandlers();
  initializeAutoSave();

  // Attach form event listeners
  const employeeForm = document.getElementById('employeeForm');
  const employerForm = document.getElementById('employerForm');

  if (employeeForm) {
    employeeForm.addEventListener('submit', handleEmployeeFormSubmit);
    console.log('Employee form initialized successfully');
  } else {
    console.log('Employee form not found - this is normal if you\'re not on the registration page');
  }

  if (employerForm) {
    employerForm.addEventListener('submit', handleEmployerFormSubmit);
    console.log('Employer form initialized successfully');
  } else {
    console.log('Employer form not found - this is normal if you\'re not on the registration page');
  }

  console.log('Application initialization complete');
});

// Global error handler
window.addEventListener('error', function(event) {
  console.error('Global error:', event.error);
  showMessage('An unexpected error occurred. Please refresh the page and try again.', 'error');
});

// Expose functions to global scope for modal buttons
window.openModal = openModal;
window.closeModal = closeModal;
window.closeSuccessModal = closeSuccessModal;