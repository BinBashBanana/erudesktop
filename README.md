# Eruda - Desktop version

[Eruda](https://github.com/liriliri/eruda) is a console for mobile browsers. This is a fork designed to be as close as possible to desktop chrome devtools without making too many modifications.

Bookmarklet (create a bookmark with this as the URL):
```javascript
javascript:(function(){var r=_=>eruda.initDesktop();if(!window.eruda){var s=document.createElement("script");s.src="https://cdn.jsdelivr.net/gh/BinBashBanana/erudesktop@master/dist/eruda.js";s.onload=r;s.onerror=_=>alert("Failed to load script");document.body.appendChild(s)}else r()})();
```

Click the bookmarklet to toggle the devtools.

List of changes from the original:
* Load Dom and Code plugins by default
* Shrunk some elements
* Improve console + add history (press shift+enter for newline)

---

[Building from source](.github/CONTRIBUTING.md)  
[API](doc/API.md)
