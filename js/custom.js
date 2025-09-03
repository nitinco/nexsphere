
(function ($) {

  "use strict";

  // COUNTER NUMBERS
  jQuery('.counter-thumb').appear(function () {
    jQuery('.counter-number').countTo();
  });
  //copyRight Year
  $(document).ready(function () {
    const currentYear = new Date().getFullYear();
    $('#copyright-text').text(currentYear);
  });
//faq open close

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

const API_BASE_URL = '"https://nexsphere-two.vercel.app/api"';
let employerFormData = {};

// Role selection functionality
document.getElementById('employeeBtn').addEventListener('click', function() {
    document.getElementById('employeeBtn').classList.add('active');
    document.getElementById('employerBtn').classList.remove('active');
    document.getElementById('employeeForm').style.display = 'block';
    document.getElementById('employerForm').style.display = 'none';
});

document.getElementById('employerBtn').addEventListener('click', function() {
    document.getElementById('employerBtn').classList.add('active');
    document.getElementById('employeeBtn').classList.remove('active');
    document.getElementById('employerForm').style.display = 'block';
    document.getElementById('employeeForm').style.display = 'none';
});

// Show loading modal
function showLoading(text = 'Processing...') {
    document.getElementById('loadingText').textContent = text;
    document.getElementById('loadingModal').style.display = 'flex';
}

// Hide loading modal
function hideLoading() {
    document.getElementById('loadingModal').style.display = 'none';
}

// Show success modal
function showSuccess(content) {
    document.getElementById('successContent').innerHTML = content;
    document.getElementById('successModal').style.display = 'flex';
}

// Close success modal
function closeSuccessModal() {
    document.getElementById('successModal').style.display = 'none';
}

// Employee form submission (free registration)
document.getElementById('employeeForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const submitBtn = document.getElementById('employeeSubmitBtn');
    const originalText = submitBtn.textContent;
    
    // Validate form
    const formData = new FormData(this);
    const employeeData = Object.fromEntries(formData.entries());
    
    // Basic validation
    if (!employeeData.name || !employeeData.email || !employeeData.contact_no) {
        alert('Please fill in all required fields');
        return;
    }
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(employeeData.email)) {
        alert('Please enter a valid email address');
        return;
    }
    
    // Validate phone number
    const phoneRegex = /^(\+91|91)?[6-9]\d{9}$/;
    if (!phoneRegex.test(employeeData.contact_no.replace(/\s+/g, ''))) {
        alert('Please enter a valid Indian phone number');
        return;
    }
    
    submitBtn.disabled = true;
    submitBtn.textContent = 'Registering...';
    showLoading('Registering employee...');
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/register-employee`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(employeeData)
        });
        
        const result = await response.json();
        
        hideLoading();
        
        if (result.success) {
            showSuccess(`
                <div class="success-message">
                    <h3>Registration Successful!</h3>
                    <p>Employee registered successfully. A confirmation email has been sent to ${employeeData.email}.</p>
                    <p><strong>Employee ID:</strong> ${result.employeeId}</p>
                </div>
            `);
            this.reset();
        } else {
            alert('Registration failed: ' + result.message);
        }
    } catch (error) {
        hideLoading();
        console.error('Error:', error);
        alert('Registration failed. Please check your internet connection and try again.');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
    }
});

// Employer form submission (opens Razorpay payment)
document.getElementById('employerForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const submitBtn = document.getElementById('employerSubmitBtn');
    const originalText = submitBtn.textContent;
    
    // Validate form
    const formData = new FormData(this);
    employerFormData = Object.fromEntries(formData.entries());
    
    // Basic validation
    if (!employerFormData.name || !employerFormData.company_name || !employerFormData.business_email || !employerFormData.business_number) {
        alert('Please fill in all required fields');
        return;
    }
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(employerFormData.business_email)) {
        alert('Please enter a valid business email address');
        return;
    }
    
    // Validate phone number
    const phoneRegex = /^(\+91|91)?[6-9]\d{9}$/;
    if (!phoneRegex.test(employerFormData.business_number.replace(/\s+/g, ''))) {
        alert('Please enter a valid Indian business phone number');
        return;
    }
    
    // Validate company size
    if (!employerFormData.company_size || employerFormData.company_size < 1) {
        alert('Please enter a valid company size');
        return;
    }
    
    submitBtn.disabled = true;
    submitBtn.textContent = 'Processing...';
    showLoading('Creating payment order...');
    
    try {
        // Create Razorpay order
        const orderResponse = await fetch(`${API_BASE_URL}/api/employer/create-order`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(employerFormData)
        });
        
        const orderData = await orderResponse.json();
        
        hideLoading();
        
        if (!orderData.success) {
            throw new Error(orderData.message || 'Failed to create payment order');
        }
        
        // Initialize Razorpay payment with all options
        initiateRazorpayPayment(orderData);
        
    } catch (error) {
        hideLoading();
        console.error('Error:', error);
        alert('Failed to initiate payment: ' + error.message);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
    }
});

// Initialize Razorpay payment with all payment options
function initiateRazorpayPayment(orderData) {
    const options = {
        key: orderData.key, // Replace with your actual Razorpay key
        amount: orderData.amount,
        currency: orderData.currency,
        name: 'Nexsphere Global',
        description: 'Employer Registration Fee',
        image: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMjAiIGZpbGw9IiMzMDdkNzMiLz4KPHRleHQgeD0iNTAiIHk9IjUwIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTQiIGZpbGw9IndoaXRlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkeT0iLjNlbSI+TlM8L3RleHQ+Cjwvc3ZnPg==',
        order_id: orderData.orderId,
        handler: function(response) {
            handlePaymentSuccess(response);
        },
        prefill: {
            name: employerFormData.name,
            email: employerFormData.business_email,
            contact: employerFormData.business_number.replace(/\D/g, '').slice(-10) // Last 10 digits
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
        config: {
            display: {
                blocks: {
                    banks: {
                        name: 'Pay using NetBanking',
                        instruments: [
                            {
                                method: 'netbanking',
                                banks: ['HDFC', 'ICICI', 'SBI', 'AXIS', 'KOTAK', 'INDUSIND', 'YES', 'PNB']
                            }
                        ]
                    },
                    utib: {
                        name: 'Pay using UPI',
                        instruments: [
                            {
                                method: 'upi'
                            }
                        ]
                    }
                },
                sequence: ['block.utib', 'block.banks', 'block.other'],
                preferences: {
                    show_default_blocks: true
                }
            }
        },
        modal: {
            ondismiss: function() {
                document.getElementById('employerSubmitBtn').disabled = false;
                document.getElementById('employerSubmitBtn').textContent = 'Register & Pay ₹999';
            }
        }
    };
    
    const rzp = new Razorpay(options);
    
    rzp.on('payment.failed', function(response) {
        handlePaymentFailure(response.error);
    });
    
    rzp.open();
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
        
        const registerResponse = await fetch(`${API_BASE_URL}/api/employer/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(registrationData)
        });
        
        const result = await registerResponse.json();
        
        hideLoading();
        
        if (result.success) {
            showSuccess(`
                <div class="success-message">
                    <h3>Registration Successful!</h3>
                    <p>Your employer account has been created successfully.</p>
                    <p><strong>Company:</strong> ${employerFormData.company_name}</p>
                    <p><strong>Payment ID:</strong> ${result.paymentId}</p>
                    <p><strong>Employer ID:</strong> ${result.employerId}</p>
                    <p>A confirmation email has been sent to ${employerFormData.business_email}</p>
                </div>
            `);
            
            // Reset form after successful registration
            document.getElementById('employerForm').reset();
            
        } else {
            alert('Registration failed: ' + result.message);
        }
        
    } catch (error) {
        hideLoading();
        console.error('Registration error:', error);
        alert('Registration failed. Please contact support.');
    } finally {
        document.getElementById('employerSubmitBtn').disabled = false;
        document.getElementById('employerSubmitBtn').textContent = 'Register & Pay ₹999';
    }
}

// Handle payment failure
function handlePaymentFailure(error) {
    console.error('Payment failed:', error);
    
    let errorMessage = 'Payment failed. Please try again.';
    
    if (error.code) {
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
                errorMessage = error.description || errorMessage;
        }
    }
    
    alert(errorMessage);
    
    document.getElementById('employerSubmitBtn').disabled = false;
    document.getElementById('employerSubmitBtn').textContent = 'Register & Pay ₹999';
}

// Modal functions
function openModal() {
    document.getElementById('consentModal').style.display = 'flex';
}

function closeModal() {
    document.getElementById('consentModal').style.display = 'none';
}

// Close modals when clicking outside
window.onclick = function(event) {
    const consentModal = document.getElementById('consentModal');
    const loadingModal = document.getElementById('loadingModal');
    const successModal = document.getElementById('successModal');
    
    if (event.target === consentModal) {
        closeModal();
    }
    if (event.target === successModal) {
        closeSuccessModal();
    }
    // Don't allow closing loading modal by clicking outside
}

// Validate form inputs on change
document.addEventListener('DOMContentLoaded', function() {
    // Email validation
    document.querySelectorAll('input[type="email"]').forEach(input => {
        input.addEventListener('blur', function() {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (this.value && !emailRegex.test(this.value)) {
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
            const phoneRegex = /^(\+91|91)?[6-9]\d{9}$/;
            const cleanPhone = this.value.replace(/\s+/g, '');
            if (this.value && !phoneRegex.test(cleanPhone)) {
                this.style.borderColor = '#dc3545';
                this.title = 'Please enter a valid Indian phone number';
            } else {
                this.style.borderColor = '#ccc';
                this.title = '';
            }
        });
    });
    
    // Company size validation
    document.querySelector('input[name="company_size"]').addEventListener('input', function() {
        if (this.value < 1) {
            this.value = 1;
        }
    });
});

// Add form auto-save functionality
function saveFormData() {
    const employeeForm = document.getElementById('employeeForm');
    const employerForm = document.getElementById('employerForm');
    
    if (employeeForm.style.display !== 'none') {
        const formData = new FormData(employeeForm);
        const data = Object.fromEntries(formData.entries());
        localStorage.setItem('employeeFormData', JSON.stringify(data));
    }
    
    if (employerForm.style.display !== 'none') {
        const formData = new FormData(employerForm);
        const data = Object.fromEntries(formData.entries());
        localStorage.setItem('employerFormData', JSON.stringify(data));
    }
}

// Load saved form data
function loadSavedFormData() {
    const savedEmployeeData = localStorage.getItem('employeeFormData');
    const savedEmployerData = localStorage.getItem('employerFormData');
    
    if (savedEmployeeData) {
        const data = JSON.parse(savedEmployeeData);
        Object.keys(data).forEach(key => {
            const input = document.querySelector(`#employeeForm input[name="${key}"]`);
            if (input) input.value = data[key];
        });
    }
}