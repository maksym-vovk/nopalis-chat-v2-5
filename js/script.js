// открывем чат после перехода с subscribe123.html
window.addEventListener('DOMContentLoaded', () => {
  try {
    const openChat = localStorage.getItem('openChat');

    if (openChat === 'true') {
      const chatBot = document.querySelector('.chat-bot');
      if (chatBot) {
        chatBot.classList.remove('hidden');

          if (typeof setBodyScrollLock === 'function') {
              setBodyScrollLock(true);
          }
      }

      // сбросить, чтобы сработало только один раз
      localStorage.removeItem('openChat');

      document.querySelectorAll('.x_order_form').forEach(form => {
        form.classList.remove('x_order_form');
        form.classList.add('x_resubmit_form');
        form.removeAttribute('action');
        form.removeAttribute('method');
      });
    }
  } catch (e) {
    console.warn('localStorage недоступен', e);
  }
});

// progress-bar animation
// const reviewsSection = document.querySelector(".reviews");
// const progressBars = document.querySelectorAll(".elementor-progress-bar[data-max]");
//
// function animateProgressBars() {
//   const sectionPosition = reviewsSection.getBoundingClientRect();
//   const isVisible = sectionPosition.top >= 0 && sectionPosition.bottom <= window.innerHeight;
//
//   if (isVisible) {
//     progressBars.forEach((progressBar) => {
//       const maxPercent = progressBar.getAttribute("data-max");
//       progressBar.style.width = maxPercent + "%";
//       progressBar.style.transition = "width 1s ease-in-out";
//     });
//     window.removeEventListener("scroll", animateProgressBars);
//   }
// }
//
// window.addEventListener("scroll", animateProgressBars);

// scroll
var linkNav = document.querySelectorAll('[href^="#"]'),
    V = 0.2;

for (var i = 0; i < linkNav.length; i++) {
    linkNav[i].addEventListener('click', function(e) { //по клику на ссылку
        e.preventDefault(); //отменяем стандартное поведение
        var w = window.pageYOffset,  // производим прокрутка прокрутка
        hash = this.href.replace(/[^#]*(.*)/, '$1');  // к id элемента, к которому нужно перейти
        t = document.querySelector(hash).getBoundingClientRect().top - 120,  // отступ от окна браузера до id
        start = null;
        requestAnimationFrame(step);  // подробнее про функцию анимации [developer.mozilla.org]
        function step(time) {
            if (start === null) start = time;
            var progress = time - start,
            r = (t < 0 ? Math.max(w - progress/V, w + t) : Math.min(w + progress/V, w + t));
            window.scrollTo(0,r);
            if (r != w + t) {
                requestAnimationFrame(step)
            } else {
                location.hash = hash  // URL с хэшем
            }
        }
    }, false);
}

// date
const months=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'],monthMin = ['','','','','','','','','','','',''],days = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'],daysMin = ['','','','','','',''],seasons = ['invierno','primavera','verano','otoño'];function postDate(daysName, daysMinName, monthsName, monthsMinName, seasonsName) {const _counterLength = 60;for (let counter = 0; counter < _counterLength; counter++) {innerDate(counter, 'date-');innerDate(counter, 'date')} function innerDate(counter, dateType) {let newCounter;dateType === 'date-' ? newCounter = -counter : newCounter = counter; const _msInDay = 86400000, _localDate = new Date(Date.now() + (newCounter * _msInDay)), _day = _localDate.getDate(), _month = _localDate.getMonth() + 1, _year = _localDate.getFullYear(); const dayDefault = addZero(_day), monthDefault = addZero(_month), defaultDate = dayDefault + '.' + monthDefault + '.' + _year; const dateClass = dateType + counter, nodeList = document.querySelectorAll('.' + dateClass); for (let i = 0; i < nodeList.length; i++) {const dateFormat = nodeList[i].dataset.format;dateFormat !== undefined && dateFormat !== ''? nodeList[i].innerHTML = String(changeFormat(dayDefault, _month, _year, dateFormat, newCounter)): nodeList[i].innerHTML = defaultDate} } function changeFormat(_day, _month, _year, format, counter) { let innerFormat = format; const testFormat = ["dd","mm","yyyy","year"], dateFormat = { dd: _day, mm: addZero(_month), yyyy: _year, year: getYearWithCounter(_year, counter), }; for (let i = 0; i < testFormat.length; i++) { let string = testFormat[i]; let regExp = new RegExp(string); innerFormat = innerFormat.replace(regExp, dateFormat[string]); } return innerFormat.split(' ').join(' ') } function getYearWithCounter(year, counter) {return year + counter} function addZero(numb){return numb<10?'0'+numb:numb} function changeFirstLetter(isBig,str){return isBig&&str&&str.length>0?str[0].toUpperCase()+str.slice(1):str} }if (document.body.classList.contains('ev-date')) {document.addEventListener("DOMContentLoaded", function () {postDate(days, daysMin, months, monthMin, seasons)});}



// document.addEventListener("DOMContentLoaded", function () {
//     const stickyBlock = document.querySelector('.doc-b');
//     const stickyParent = stickyBlock.parentElement;
//     const bottomEdge = document.querySelector(".stop-side");
//     const offset = 20; // відступ від верху екрану
//
//     // Створюємо обгортку
//     const stickyWrap = document.createElement("div");
//     stickyWrap.classList.add("sticky-wrap");
//     stickyWrap.style.position = "relative"; // ключово для absolute-зупинки
//     stickyParent.appendChild(stickyWrap);
//     stickyWrap.appendChild(stickyBlock);
//
//     // Встановлюємо висоту обгортки = висота батьківської колонки
//     // щоб блок мав "простір" для подорожі вниз
//     function syncWrapHeight() {
//         stickyWrap.style.height = stickyParent.offsetHeight + "px";
//     }
//     syncWrapHeight();
//     window.addEventListener("resize", syncWrapHeight);
//
//     function setPositionSticky() {
//         const wrapTop    = stickyWrap.getBoundingClientRect().top;
//         const wrapHeight = stickyWrap.offsetHeight;
//         const blockHeight = stickyBlock.offsetHeight;
//         const stopY      = bottomEdge.getBoundingClientRect().top;
//
//         if (wrapTop >= offset) {
//             // Ще не доскролили — блок на місці
//             stickyBlock.style.position = "static";
//             stickyBlock.style.top = "";
//
//         } else if (stopY >= blockHeight + offset) {
//             // Скролимо в зоні — фіксуємо
//             stickyBlock.style.position = "fixed";
//             stickyBlock.style.top = offset + "px";
//             stickyBlock.style.opacity = "1";
//
//         } else {
//             // Досягли зупинки — прибиваємо до дна обгортки
//             stickyBlock.style.opacity = "0";
//             stickyBlock.style.position = "fixed";
//             stickyBlock.style.top = offset + "px";
//         }
//     }
//
//     setPositionSticky();
//     window.addEventListener("scroll", setPositionSticky);
// });


document.addEventListener("DOMContentLoaded", function () {
    const stickyBlock = document.querySelector('.doc-b');
    const stickyParent = stickyBlock.parentElement;
    const stopElement = document.querySelector(".stop-side");

    const offset = 20; // відступ від нижнього краю екрану

    // Створюємо обгортку
    const stickyWrap = document.createElement("div");
    stickyWrap.classList.add("sticky-wrap");
    stickyWrap.style.position = "relative";
    stickyParent.appendChild(stickyWrap);
    stickyWrap.appendChild(stickyBlock);

    // Синхронізуємо висоту обгортки
    function syncWrapHeight() {
        stickyWrap.style.height = stickyParent.offsetHeight + "px";
    }
    syncWrapHeight();
    window.addEventListener("resize", syncWrapHeight);

    function setPositionSticky() {
        const wrapRect = stickyWrap.getBoundingClientRect();
        const blockHeight = stickyBlock.offsetHeight;
        const stopRect = stopElement ? stopElement.getBoundingClientRect() : null;

        if (wrapRect.top > offset) {
            // Ще не почали прилипати — звичайне положення
            stickyBlock.style.position = "fixed";
            stickyBlock.style.bottom = "20px";
            stickyBlock.style.top = "";
            stickyBlock.style.opacity = "1";

        } else if (!stopRect || stopRect.top > window.innerHeight - blockHeight - offset) {
            // Зона прилипання — фіксуємо знизу
            stickyBlock.style.position = "fixed";
            stickyBlock.style.bottom = offset + "px";
            stickyBlock.style.top = "auto";
            stickyBlock.style.opacity = "1";

        } else {
            // Досягли стоп-елемента — плавно зникаємо
            stickyBlock.style.position = "fixed";
            stickyBlock.style.bottom = offset + "px";
            stickyBlock.style.top = "auto";
            stickyBlock.style.opacity = "0";        // ← плавне зникнення
        }
    }

    // Ініціалізація
    setPositionSticky();
    window.addEventListener("scroll", setPositionSticky);
    window.addEventListener("resize", setPositionSticky);
});

// promo js

var VID_ID   = 'xvVIqTIYMdw';
var player   = null;
var isMuted  = false;
var ytApiReady = false;

/* ─── Загружаем YouTube IFrame API только по клику ─── */
function loadYTApi() {
    if (document.getElementById('yt-iframe-api')) return; // уже загружен
    var s = document.createElement('script');
    s.id  = 'yt-iframe-api';
    s.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(s);
}

/* ─── Подменяем facade на реальный iframe ─── */
function activateFacade() {
    var facade = document.getElementById('yt-facade');
    if (!facade) return;

    var w = facade.offsetWidth  || 380;
    var h = facade.offsetHeight || 680;

    // Создаём div-плейсхолдер для YT.Player
    var placeholder = document.createElement('div');
    placeholder.id = 'player';
    facade.replaceWith(placeholder);

    // Если API уже готов — создаём плейер сразу
    if (ytApiReady) {
        createPlayer(placeholder.id, w, h);
    } else {
        // Иначе ждём события onYouTubeIframeAPIReady
        window._ytPendingInit = { id: placeholder.id, w: w, h: h };
    }

    loadYTApi();
}

/* ─── Создание YT.Player ─── */
function createPlayer(elId, w, h) {
    player = new YT.Player(elId, {
        height: String(h),
        width:  String(w),
        videoId: VID_ID,
        playerVars: {
            autoplay:       1,
            controls:       0,
            modestbranding: 0,
            rel:            0,
            showinfo:       0,
            playsinline:    1,
            fs:             0,
            disablekb:      1,
            origin:         location.origin,
        },
        events: {
            onReady:       onPlayerReady,
            onStateChange: onPlayerStateChange,
        },
    });
}

/* ─── YT IFrame API готов ─── */
window.onYouTubeIframeAPIReady = function () {
    ytApiReady = true;
    if (window._ytPendingInit) {
        var p = window._ytPendingInit;
        createPlayer(p.id, p.w, p.h);
        delete window._ytPendingInit;
    }
};

function showPauseBtn() {
    var btn = document.querySelector('.pause-video');
    if (!btn) return;
    btn.style.display = 'block';
    // небольшой delay чтобы transition сработал после display:block
    requestAnimationFrame(function () {
        btn.classList.add('visible');
    });
}

function hidePauseBtn() {
    var btn = document.querySelector('.pause-video');
    if (!btn) return;
    btn.classList.remove('visible');
    // скрываем после окончания transition
    // btn.addEventListener('transitionend', function hide() {
    //     btn.style.display = 'none';
    //     btn.removeEventListener('transitionend', hide);
    // });
}

/* ─── Состояния плейера ─── */
function onPlayerStateChange(event) {
    if (event.data === YT.PlayerState.PAUSED) {
        showPauseBtn();
    } else {
        // PLAYING, ENDED, BUFFERING — скрываем
        hidePauseBtn();
    }
}

/* ─── Плейер готов ─── */
function onPlayerReady() {
    player.playVideo();

    var pauseBtn = document.querySelector('.pause-video');
    if (pauseBtn) {
        pauseBtn.addEventListener('click', function () {
            hidePauseBtn();
            player.playVideo();
        });
    }

    // Громкость
    var volBtn = document.getElementById('volume');
    if (volBtn) {
        volBtn.addEventListener('click', function () {
            if (isMuted) {
                player.unMute();
                isMuted = false;
                this.classList.add('on');
            } else {
                player.mute();
                isMuted = true;
                this.classList.remove('on');
            }
        });
    }

    // Перемотка
    function forward()  { player.seekTo(player.getCurrentTime() + 10, true); }
    function backward() { player.seekTo(player.getCurrentTime() - 10, true); }

    var fwdBtn = document.getElementById('forward');
    var bwdBtn = document.getElementById('backward');
    if (fwdBtn) fwdBtn.addEventListener('click', forward);
    if (bwdBtn) bwdBtn.addEventListener('click', backward);

    document.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowRight') forward();
        else if (e.key === 'ArrowLeft') backward();
    });
}

/* ─── Клик по facade → запуск ─── */
document.addEventListener('DOMContentLoaded', function () {
    var facade = document.getElementById('yt-facade');
    if (facade) {
        facade.addEventListener('click', activateFacade, { once: true });
    }
});


var links = document.querySelectorAll('#order_form a');

links.forEach(function (link) {
    link.addEventListener('click', function (event) {
        event.preventDefault();

        var targetId = this.getAttribute('href'),
            targetElement = document.querySelector(targetId),
            scrollOptions = {
                behavior: 'smooth',
            };

        targetElement.scrollIntoView(scrollOptions);
    });
});

let time = 600;
let intr;

function start_timer() {
    clearInterval(intr);
    time = 600;
    intr = setInterval(tick, 1000);
}

function tick() {
    time--;
    const mins = Math.floor(time / 60);
    const secs = time % 60;

    document.getElementById('min').textContent = mins < 10 ? `0${mins}` : mins;
    document.getElementById('sec').textContent = secs < 10 ? `0${secs}` : secs;

    if (time <= 0) {
        clearInterval(intr);
        start_timer();
    }
}

window.onload = start_timer;

// promo js
