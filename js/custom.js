
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

 // Toggle Forms
const employeeBtn = document.getElementById('employeeBtn');
const employerBtn = document.getElementById('employerBtn');
const employeeForm = document.getElementById('employeeForm');
const employerForm = document.getElementById('employerForm');

employeeBtn.addEventListener('click', () => {
    employeeBtn.classList.add('active');
    employerBtn.classList.remove('active');
    employeeForm.style.display = 'block';
    employerForm.style.display = 'none';
});

employerBtn.addEventListener('click', () => {
    employerBtn.classList.add('active');
    employeeBtn.classList.remove('active');
    employerForm.style.display = 'block';
    employeeForm.style.display = 'none';
});


    // Modal Functions
    function openModal() {
        document.getElementById('consentModal').style.display = 'flex';
    }
    function closeModal() {
        document.getElementById('consentModal').style.display = 'none';
    }
    window.onclick = function(event) {
        if (event.target == document.getElementById('consentModal')) {
            closeModal();
        }
    }

    // Sample user data for demonstration
        const users = [
            { email: 'hr@nexspherehr.in', password: 'Nex63670' },
            // { email: 'hr@company.com', password: 'hr123' },
            // { email: 'manager@company.com', password: 'manager123' }
        ];

        function togglePassword() {
            const passwordInput = document.getElementById('password');
            const eyeOpen = document.getElementById('eyeOpen');
            const eyeClosed = document.getElementById('eyeClosed');
            
            if (passwordInput.type === 'password') {
                passwordInput.type = 'text';
                eyeOpen.style.display = 'none';
                eyeClosed.style.display = 'block';
            } else {
                passwordInput.type = 'password';
                eyeOpen.style.display = 'block';
                eyeClosed.style.display = 'none';
            }
        }

        function showMessage(type, message) {
            const errorDiv = document.getElementById('errorMessage');
            const successDiv = document.getElementById('successMessage');
            
            // Hide both messages first
            errorDiv.style.display = 'none';
            successDiv.style.display = 'none';
            
            if (type === 'error') {
                errorDiv.textContent = message;
                errorDiv.style.display = 'block';
            } else {
                successDiv.textContent = message;
                successDiv.style.display = 'block';
            }
        }

        function showForgotPassword() {
            const email = document.getElementById('email').value;
            
            if (!email) {
                showMessage('error', 'Please enter your email address first to reset your password.');
                document.getElementById('email').focus();
                return;
            }
            
            if (!email.includes('@')) {
                showMessage('error', 'Please enter a valid email address.');
                return;
            }
            
            // Check if email exists in our system
            const userExists = users.find(u => u.email === email);
            
            if (userExists) {
                showMessage('success', `Password reset instructions have been sent to ${email}. Please check your inbox.`);
                
                // In a real application, you would send an actual reset email here
                setTimeout(() => {
                    showMessage('success', 'For demo: Your new temporary password is "temp123". Please change it after login.');
                }, 3000);
            } else {
                showMessage('error', 'Email address not found in our system. Please contact your HR administrator.');
            }
        }

        // Load remembered credentials on page load
        window.addEventListener('load', function() {
            const rememberedEmail = localStorage.getItem('hr_remembered_email');
            const rememberedPassword = localStorage.getItem('hr_remembered_password');
            
            if (rememberedEmail && rememberedPassword) {
                document.getElementById('email').value = rememberedEmail;
                document.getElementById('password').value = rememberedPassword;
                document.getElementById('remember').checked = true;
                showMessage('success', 'Welcome back! Your credentials have been remembered.');
            }
        });

        document.getElementById('loginForm').addEventListener('submit', function(e) {
            e.preventDefault();
            
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            const rememberMe = document.getElementById('remember').checked;
            
            // Basic validation
            if (!email || !password) {
                showMessage('error', 'Please fill in all required fields.');
                return;
            }
            
            if (!email.includes('@')) {
                showMessage('error', 'Please enter a valid email address.');
                return;
            }
            
            // Check credentials against sample users
            const user = users.find(u => u.email === email && u.password === password);
            
            if (user) {
                // Handle "Remember Me" functionality
                if (rememberMe) {
                    localStorage.setItem('hr_remembered_email', email);
                    localStorage.setItem('hr_remembered_password', password);
                    showMessage('success', 'Login successful! Your credentials have been saved for next time.');
                } else {
                    // Clear any previously saved credentials
                    localStorage.removeItem('hr_remembered_email');
                    localStorage.removeItem('hr_remembered_password');
                    showMessage('success', 'Login successful! Redirecting to HR dashboard...');
                }
                
                // Simulate redirect after successful login
                setTimeout(() => {
                    showMessage('success', 'Welcome to the HR Portal! (This is a demo)');
                }, 1500);
            } else {
                showMessage('error', 'Invalid email or password. Try: admin@hr.com / admin123');
            }
        });

        // Add some interactive feedback
        document.querySelectorAll('.form-input').forEach(input => {
            input.addEventListener('focus', function() {
                this.parentElement.style.transform = 'translateY(-2px)';
            });
            
            input.addEventListener('blur', function() {
                this.parentElement.style.transform = 'translateY(0)';
            });
        });


        