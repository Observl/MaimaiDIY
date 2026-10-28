(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
"use strict";

// メニュー開閉
$(".header--btn, .header--nav__btn").on("click", function (e) {
  e.preventDefault();
  $(".header--nav").toggleClass("open");
}); // ボタンスクロール連動

$(window).on("scroll", function () {
  var $toTopButton = $(".header--btn,.common--top");
  var scrollTop = $(this).scrollTop();
  var windowHeight = $(this).height();

  if (scrollTop >= windowHeight - 600) {
    $toTopButton.removeClass("off");
  } else {
    $toTopButton.addClass("off");
  }
}); // カレント表示

$(window).on("load", function () {
  var now_position = $(".header--nav").data("now");
  $(".header--nav__link").each(function (index, element) {
    var link_position = $(this).data("current");

    if (now_position == link_position) {
      $(this).addClass("on");
    }
  });
});
$(window).on("load", function () {
  var now_position = $(".common--header").data("now");
  $(".play--nav__link,.dl--nav__link").each(function (index, element) {
    var link_position = $(this).data("current");

    if (now_position == link_position) {
      $(this).addClass("on");
    }
  });
}); // スムーススクロール

$('a[href^="#"]').click(function () {
  var speed = 500;
  var href = $(this).attr("href");
  var target = $(href == "#" || href == "" ? "html" : href);
  var position = target.offset().top;

  if ($(this).hasClass("smooth")) {
    $("html, body").animate({
      scrollTop: position
    }, speed, "swing");
  }

  return false;
});

},{}]},{},[1])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJzcmMvanMvcHJvamVjdC5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O0FDQUE7QUFDQSxDQUFDLENBQUMsaUNBQUQsQ0FBRCxDQUFxQyxFQUFyQyxDQUF3QyxPQUF4QyxFQUFpRCxVQUFVLENBQVYsRUFBYTtFQUM1RCxDQUFDLENBQUMsY0FBRjtFQUNBLENBQUMsQ0FBQyxjQUFELENBQUQsQ0FBa0IsV0FBbEIsQ0FBOEIsTUFBOUI7QUFDRCxDQUhELEUsQ0FLQTs7QUFDQSxDQUFDLENBQUMsTUFBRCxDQUFELENBQVUsRUFBVixDQUFhLFFBQWIsRUFBdUIsWUFBWTtFQUNqQyxJQUFJLFlBQVksR0FBRyxDQUFDLENBQUMsMkJBQUQsQ0FBcEI7RUFDQSxJQUFJLFNBQVMsR0FBRyxDQUFDLENBQUMsSUFBRCxDQUFELENBQVEsU0FBUixFQUFoQjtFQUNBLElBQUksWUFBWSxHQUFHLENBQUMsQ0FBQyxJQUFELENBQUQsQ0FBUSxNQUFSLEVBQW5COztFQUNBLElBQUksU0FBUyxJQUFJLFlBQVksR0FBRyxHQUFoQyxFQUFxQztJQUNuQyxZQUFZLENBQUMsV0FBYixDQUF5QixLQUF6QjtFQUNELENBRkQsTUFFTztJQUNMLFlBQVksQ0FBQyxRQUFiLENBQXNCLEtBQXRCO0VBQ0Q7QUFDRixDQVRELEUsQ0FXQTs7QUFDQSxDQUFDLENBQUMsTUFBRCxDQUFELENBQVUsRUFBVixDQUFhLE1BQWIsRUFBcUIsWUFBWTtFQUMvQixJQUFJLFlBQVksR0FBRyxDQUFDLENBQUMsY0FBRCxDQUFELENBQWtCLElBQWxCLENBQXVCLEtBQXZCLENBQW5CO0VBQ0EsQ0FBQyxDQUFDLG9CQUFELENBQUQsQ0FBd0IsSUFBeEIsQ0FBNkIsVUFBVSxLQUFWLEVBQWlCLE9BQWpCLEVBQTBCO0lBQ3JELElBQUksYUFBYSxHQUFHLENBQUMsQ0FBQyxJQUFELENBQUQsQ0FBUSxJQUFSLENBQWEsU0FBYixDQUFwQjs7SUFDQSxJQUFJLFlBQVksSUFBSSxhQUFwQixFQUFtQztNQUNqQyxDQUFDLENBQUMsSUFBRCxDQUFELENBQVEsUUFBUixDQUFpQixJQUFqQjtJQUNEO0VBQ0YsQ0FMRDtBQU1ELENBUkQ7QUFVQSxDQUFDLENBQUMsTUFBRCxDQUFELENBQVUsRUFBVixDQUFhLE1BQWIsRUFBcUIsWUFBWTtFQUMvQixJQUFJLFlBQVksR0FBRyxDQUFDLENBQUMsaUJBQUQsQ0FBRCxDQUFxQixJQUFyQixDQUEwQixLQUExQixDQUFuQjtFQUNBLENBQUMsQ0FBQyxpQ0FBRCxDQUFELENBQXFDLElBQXJDLENBQTBDLFVBQVUsS0FBVixFQUFpQixPQUFqQixFQUEwQjtJQUNsRSxJQUFJLGFBQWEsR0FBRyxDQUFDLENBQUMsSUFBRCxDQUFELENBQVEsSUFBUixDQUFhLFNBQWIsQ0FBcEI7O0lBQ0EsSUFBSSxZQUFZLElBQUksYUFBcEIsRUFBbUM7TUFDakMsQ0FBQyxDQUFDLElBQUQsQ0FBRCxDQUFRLFFBQVIsQ0FBaUIsSUFBakI7SUFDRDtFQUNGLENBTEQ7QUFNRCxDQVJELEUsQ0FVQTs7QUFDQSxDQUFDLENBQUMsY0FBRCxDQUFELENBQWtCLEtBQWxCLENBQXdCLFlBQVk7RUFDbEMsSUFBSSxLQUFLLEdBQUcsR0FBWjtFQUNBLElBQUksSUFBSSxHQUFHLENBQUMsQ0FBQyxJQUFELENBQUQsQ0FBUSxJQUFSLENBQWEsTUFBYixDQUFYO0VBQ0EsSUFBSSxNQUFNLEdBQUcsQ0FBQyxDQUFDLElBQUksSUFBSSxHQUFSLElBQWUsSUFBSSxJQUFJLEVBQXZCLEdBQTRCLE1BQTVCLEdBQXFDLElBQXRDLENBQWQ7RUFDQSxJQUFJLFFBQVEsR0FBRyxNQUFNLENBQUMsTUFBUCxHQUFnQixHQUEvQjs7RUFDQSxJQUFJLENBQUMsQ0FBQyxJQUFELENBQUQsQ0FBUSxRQUFSLENBQWlCLFFBQWpCLENBQUosRUFBZ0M7SUFDOUIsQ0FBQyxDQUFDLFlBQUQsQ0FBRCxDQUFnQixPQUFoQixDQUF3QjtNQUN0QixTQUFTLEVBQUU7SUFEVyxDQUF4QixFQUVHLEtBRkgsRUFFVSxPQUZWO0VBR0Q7O0VBQ0QsT0FBTyxLQUFQO0FBQ0QsQ0FYRCIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uKCl7ZnVuY3Rpb24gcihlLG4sdCl7ZnVuY3Rpb24gbyhpLGYpe2lmKCFuW2ldKXtpZighZVtpXSl7dmFyIGM9XCJmdW5jdGlvblwiPT10eXBlb2YgcmVxdWlyZSYmcmVxdWlyZTtpZighZiYmYylyZXR1cm4gYyhpLCEwKTtpZih1KXJldHVybiB1KGksITApO3ZhciBhPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIraStcIidcIik7dGhyb3cgYS5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGF9dmFyIHA9bltpXT17ZXhwb3J0czp7fX07ZVtpXVswXS5jYWxsKHAuZXhwb3J0cyxmdW5jdGlvbihyKXt2YXIgbj1lW2ldWzFdW3JdO3JldHVybiBvKG58fHIpfSxwLHAuZXhwb3J0cyxyLGUsbix0KX1yZXR1cm4gbltpXS5leHBvcnRzfWZvcih2YXIgdT1cImZ1bmN0aW9uXCI9PXR5cGVvZiByZXF1aXJlJiZyZXF1aXJlLGk9MDtpPHQubGVuZ3RoO2krKylvKHRbaV0pO3JldHVybiBvfXJldHVybiByfSkoKSIsIi8vIOODoeODi+ODpeODvOmWi+mWiVxuJChcIi5oZWFkZXItLWJ0biwgLmhlYWRlci0tbmF2X19idG5cIikub24oXCJjbGlja1wiLCBmdW5jdGlvbiAoZSkge1xuICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICQoXCIuaGVhZGVyLS1uYXZcIikudG9nZ2xlQ2xhc3MoXCJvcGVuXCIpO1xufSk7XG5cbi8vIOODnOOCv+ODs+OCueOCr+ODreODvOODq+mAo+WLlVxuJCh3aW5kb3cpLm9uKFwic2Nyb2xsXCIsIGZ1bmN0aW9uICgpIHtcbiAgdmFyICR0b1RvcEJ1dHRvbiA9ICQoXCIuaGVhZGVyLS1idG4sLmNvbW1vbi0tdG9wXCIpO1xuICB2YXIgc2Nyb2xsVG9wID0gJCh0aGlzKS5zY3JvbGxUb3AoKTtcbiAgdmFyIHdpbmRvd0hlaWdodCA9ICQodGhpcykuaGVpZ2h0KCk7XG4gIGlmIChzY3JvbGxUb3AgPj0gd2luZG93SGVpZ2h0IC0gNjAwKSB7XG4gICAgJHRvVG9wQnV0dG9uLnJlbW92ZUNsYXNzKFwib2ZmXCIpO1xuICB9IGVsc2Uge1xuICAgICR0b1RvcEJ1dHRvbi5hZGRDbGFzcyhcIm9mZlwiKTtcbiAgfVxufSk7XG5cbi8vIOOCq+ODrOODs+ODiOihqOekulxuJCh3aW5kb3cpLm9uKFwibG9hZFwiLCBmdW5jdGlvbiAoKSB7XG4gIHZhciBub3dfcG9zaXRpb24gPSAkKFwiLmhlYWRlci0tbmF2XCIpLmRhdGEoXCJub3dcIik7XG4gICQoXCIuaGVhZGVyLS1uYXZfX2xpbmtcIikuZWFjaChmdW5jdGlvbiAoaW5kZXgsIGVsZW1lbnQpIHtcbiAgICB2YXIgbGlua19wb3NpdGlvbiA9ICQodGhpcykuZGF0YShcImN1cnJlbnRcIik7XG4gICAgaWYgKG5vd19wb3NpdGlvbiA9PSBsaW5rX3Bvc2l0aW9uKSB7XG4gICAgICAkKHRoaXMpLmFkZENsYXNzKFwib25cIik7XG4gICAgfVxuICB9KTtcbn0pO1xuXG4kKHdpbmRvdykub24oXCJsb2FkXCIsIGZ1bmN0aW9uICgpIHtcbiAgdmFyIG5vd19wb3NpdGlvbiA9ICQoXCIuY29tbW9uLS1oZWFkZXJcIikuZGF0YShcIm5vd1wiKTtcbiAgJChcIi5wbGF5LS1uYXZfX2xpbmssLmRsLS1uYXZfX2xpbmtcIikuZWFjaChmdW5jdGlvbiAoaW5kZXgsIGVsZW1lbnQpIHtcbiAgICB2YXIgbGlua19wb3NpdGlvbiA9ICQodGhpcykuZGF0YShcImN1cnJlbnRcIik7XG4gICAgaWYgKG5vd19wb3NpdGlvbiA9PSBsaW5rX3Bvc2l0aW9uKSB7XG4gICAgICAkKHRoaXMpLmFkZENsYXNzKFwib25cIik7XG4gICAgfVxuICB9KTtcbn0pO1xuXG4vLyDjgrnjg6Djg7zjgrnjgrnjgq/jg63jg7zjg6tcbiQoJ2FbaHJlZl49XCIjXCJdJykuY2xpY2soZnVuY3Rpb24gKCkge1xuICB2YXIgc3BlZWQgPSA1MDA7XG4gIHZhciBocmVmID0gJCh0aGlzKS5hdHRyKFwiaHJlZlwiKTtcbiAgdmFyIHRhcmdldCA9ICQoaHJlZiA9PSBcIiNcIiB8fCBocmVmID09IFwiXCIgPyBcImh0bWxcIiA6IGhyZWYpO1xuICB2YXIgcG9zaXRpb24gPSB0YXJnZXQub2Zmc2V0KCkudG9wO1xuICBpZiAoJCh0aGlzKS5oYXNDbGFzcyhcInNtb290aFwiKSkge1xuICAgICQoXCJodG1sLCBib2R5XCIpLmFuaW1hdGUoe1xuICAgICAgc2Nyb2xsVG9wOiBwb3NpdGlvblxuICAgIH0sIHNwZWVkLCBcInN3aW5nXCIpO1xuICB9XG4gIHJldHVybiBmYWxzZTtcbn0pOyJdfQ==
