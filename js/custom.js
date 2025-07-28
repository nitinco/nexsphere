
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


