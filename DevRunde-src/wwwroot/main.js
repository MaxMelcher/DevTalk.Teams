﻿// initialize microsoft teams.
microsoftTeams.initialize();

$(document).ready(function () {

  log("ready");
  try {


    window.authConfig = {
      tenant: 'MSDNKnowledgeManagementaleg.onmicrosoft.com',
      clientId: 'eaf47017-07ad-48c3-9443-74a10e156b9c',
      redirectUri: 'https://devrunde.azurewebsites.net/',
      postLogoutRedirectUri: 'https://devrunde.azurewebsites.net/logout.html',
      endpoints: {
        graph: 'https://graph.microsoft.com'
      },
      displayCall: authenticate,
      cacheLocation: 'localStorage'
    };

    window.appConfig = {
      siteHost: 'melcherit.sharepoint.com',
      siteUrl: '/',
      documentLibrary: '<BikeDocuments>',
      list: '<BikeInventory>'
    };

    window.authContext = new AuthenticationContext(window.authConfig);
    // determine if it's the callback page in a popup window redirecting from authentication page.
    if (window.authContext.isCallback(window.location.hash)) {
      // acquire graph token and notify the main page.
      window.authContext.handleWindowCallback();
      var loginError = window.authContext.getLoginError();
      if (!loginError) {
        window.authContext.acquireToken(window.authConfig.endpoints.graph, function (message, token) {
          if (token) {
            microsoftTeams.authentication.notifySuccess(token);
          }
          else {
            microsoftTeams.authentication.notifyFailure("Acquring Graph Token Failed: " + message);
          }
        });
      }
      else {
        microsoftTeams.authentication.notifyFailure("Login Failed: " + loginError);
      }
    }
    else {
      // it's the main page, initialize it.
      initPage();
    }

  } catch (e) {
    log("exception: " + e);
  }
});

function log(msg) {
  $("#log").append(msg + "<br/>");
}

// initialize the page.
function initPage() {

  try {


    $("body").show();
    var curUser = window.authContext.getCachedUser();
    log("user:" + curUser);
    if (curUser) {
      showUserInfo(curUser);
      window.authContext.acquireToken(window.authConfig.endpoints.graph,
        function(message, token) {
          window.localStorage.setItem("graphToken", token);
          if (token) {

          } else {
            authenticateFailed("Acquring Graph Token Failed: " + message);
          }
        });

      $('#embed').show();

    } else {
      cleanPage();
    }
  } catch (e) {
    log(e);
  }

}

// handle the navigation to Azure AD authorization endpoint when login.
// Microsoft Teams tab needs to explicitly authenticate the user in a pop up window, as it can't redirect to other domains directly.
function authenticate(url) {
  microsoftTeams.authentication.authenticate({
    url: url, width: 500, height: 700, successCallback: authenticateSucceeded, failureCallback: authenticateFailed
  });
}

// callback function called if the login or log out succeeds in the authentication popup.
function authenticateSucceeded(token) {
  $("body").show();
  if (token) {
    window.localStorage.setItem("graphToken", token);

    var curUser = window.authContext.getCachedUser();
    showUserInfo(curUser);
    getData();
  }
  else {
    cleanPage();
  }
}

// callback function called if the login failed in the authentication popup or acquire graph token failed.
function authenticateFailed(message) {
  $("#message").append("<div>" + message + "</div>");
  if (typeof (message) === "string") {
    if (message.indexOf("Login Failed:") === 0) {
      $("#message").append("<div>Please check your account and Log In again.</div>");
    }
    else if (message.indexOf("Acquring Graph Token Failed:") === 0) {
      $("#message").append("<div>Please try Log Out and Log In again.</div>");
    }
  }
}

// navigate to Azure AD authorization endpoint to log out.
// Microsoft Teams tab needs to explicitly log out in a pop up window, as it can't redirect to other domains directly.
// we can't use ADAL's logOut function because it will redirect to the Azure AD authorization endpoint directly.
function logOut() {
  window.authContext.clearCache();
  window.authContext._user = null;
  window.authContext._loginInProgress = false;

  var logout = 'post_logout_redirect_uri=' + encodeURIComponent(window.authContext.config.postLogoutRedirectUri);
  var urlNavigate = window.authContext.instance + window.authContext.config.tenant + '/oauth2/logout?' + logout;
  microsoftTeams.authentication.authenticate({
    url: urlNavigate, width: 400, height: 600, successCallback: authenticateSucceeded
  });
}

// login by ADAL.
function login() {
  try {
    window.authContext._loginInProgress = false;
    window.authContext.login();
  } catch (e) {
    log(e);
  } 

}

// clean up the data shown in the page.
function cleanPage() {
  showUserInfo();
  $("#docBin").empty();
  $("#inventoryBin").empty();
  showDetailsPage(false);
}

// show or hide the details page.
function showDetailsPage(show) {
  $("#detailsPage").toggle(show);
  $("#inventoryPage").toggle(!show);
}

// show user info, toggle the login and log Out buttons.
function showUserInfo(user) {
  var signedIn = typeof user !== "undefined" && user !== null;
  var userName = signedIn ? user.profile.name : "";
  window.localStorage.setItem("userName", userName);

  $("#signedInAsLabel").toggle(signedIn);
  $(".app-signIn").toggle(!signedIn);
  $(".app-signOut").toggle(signedIn);
}

// show details page for the selected bike.
function showBike() {
  var item = $(this).data("bike");
  if (!item) {
    return;
  }

  if (item.fields.Picture !== null) {
    $("#bikeImage").css("background-image", "url('" + item.fields.Picture.Url + "')");
  }

  $("#bikeTitle").text(item.fields.Title + " " + item.fields.Serial);
  $("#bikeDescription").html(item.fields.Description);
  $("#bikeDetailsPrice").text(item.fields.Price + " / day");
  $("#bikeDetailsLocation").text(item.fields.Location);
  $("#bikeDetailsCondition").text(item.fields.Condition);
  $("#detailsPage").data("bike", item);

  showDetailsPage(true);
}

// actions (check out and check in) for a bike.
// it will show waiting message for 1.2 seconds, then toggle the bike's state.
function bikeAction() {
  var jElement = $(this);
  if (jElement.hasClass("wait")) {
    return;
  }

  var isCheckOut = jElement.hasClass("checkOut");
  jElement.removeClass("checkOut checkIn").addClass("wait");
  window.setTimeout(bikeActionCompleted.bind(jElement, isCheckOut), 1200);
}

// function called when the action (check out or check in) for a bike completes.
function bikeActionCompleted(isCheckOut) {
  this.removeClass("wait").addClass(isCheckOut ? "checkIn" : "checkOut");
  this.closest("#detailsPage").data("lastAction", isCheckOut ? "checked out" : "checked in");
}

// get documents and bikes.
function getData() {
  acquireSiteId(function () {
    acquireListIds(function () {
      retrieveBikes();
      retrieveDocs();
    });
  });
}

// get documents from sharepoint document library and show them.
function retrieveDocs() {
  var token = getGraphToken();
  var siteId = getSiteId();
  var listId = getListId(window.appConfig.documentLibrary);
  if (!token || !siteId || !listId) {
    return;
  }

  $.ajax({
    type: "GET",
    url: window.authConfig.endpoints.graph + "/v1.0/sites/" + siteId + "/lists/" + listId + "/items?expand=columnSet",
    dataType: "json",
    headers: {
      'Authorization': 'Bearer ' + getGraphToken(),
      'Accept': 'application/json'
    }
  }).done(function (response) {
    var docs = response.value;
    for (var i = 0; i < docs.length; i++) {
      var item = docs[i];
      var sDocName = getFileNameWithoutExtension(item.fields.LinkFilename);

      var element = $("<a target='_blank'>").attr("href", item.webUrl + "?web=1").addClass("docTile ms-font-m");
      var html = $("<div>");
      var content = $("<div class='docTileContent'>").appendTo(html);
      var text = $("<div class='docTileText'>").text(sDocName).appendTo(content);
      var icon = $("<div class='docTileIcon'><i class='ms-Icon ms-Icon--WordLogo'></i></div>").appendTo(content);
      element.html(html);
      $("#docBin").append(element);
    }
  }).fail(function (response) {
    $("#message").html("Web Request Failed: " + response.responseText);
  });
}

// get bikes from sharepoint list and show them.
function retrieveBikes() {
  var token = getGraphToken();
  var siteId = getSiteId();
  var listId = getListId(window.appConfig.list);
  if (!token || !siteId || !listId) {
    return;
  }

  $.ajax({
    type: "GET",
    url: window.authConfig.endpoints.graph + "/v1.0/sites/" + siteId + "/lists/" + listId + "/items?expand=columnSet",
    dataType: "json",
    headers: {
      'Authorization': 'Bearer ' + token,
      'Accept': 'application/json'
    }
  }).done(function (response) {
    var bikes = response.value;
    for (var i = 0; i < bikes.length; i++) {
      var item = bikes[i];

      var element = $("<div class='itemTile ms-font-m'>").data("bike", item);
      var html = $("<div>");

      var image = $("<div class='itemTileImage'>").appendTo(html);
      if (item.fields.Picture !== null) {
        image.css("background-image", "url('" + item.fields.Picture.Url + "')");
      }

      var content = $("<div class='itemTileContent'>").appendTo(html);
      var text = $("<div class='itemTileText'>").text(item.fields.Title + " " + item.fields.Serial).appendTo(content);

      if (item.fields.Color_x0020_Swatch !== null) {
        var color = $("<div class='itemColorArea'>").appendTo(content);
        var colorSwatch = $("<div class='itemColorSwatch'>").css("background-color", item.fields.Color_x0020_Swatch).appendTo(color);
        var colorTitle = $("<div class='itemColorTitle'>").text(item.fields.Color_x0020_Scheme).appendTo(color);
      }

      if (item.fields.Price !== null) {
        var price = $("<div class='itemFieldArea'>").appendTo(content);
        price.append("<div class='itemFieldLabel'>Price</div>");
        $("<div class='itemFieldValue'>").text(item.fields.Price).appendTo(price);
        price.append("<span> / day</span>");
      }

      if (item.fields.Location !== null) {
        var location = $("<div class='itemFieldArea'>").appendTo(content);
        location.append("<div class='itemFieldLabel'>Location</div>");
        $("<div class='itemFieldValue'>").text(item.fields.Location).appendTo(location);
      }


      element.html(html).click(showBike);
      $("#inventoryBin").append(element);
    }
  }).fail(function (response) {
    $("#message").html("Web Request Failed: " + response.responseText);
  });
}

// acquire the site Id according the site url
function acquireSiteId(cb) {
  var token = getGraphToken();
  if (!token) {
    return;
  }

  $.ajax({
    type: "GET",
    url: window.authConfig.endpoints.graph + "/v1.0/sites/" +
      window.appConfig.siteHost +
      (window.appConfig.siteUrl ? ":" + window.appConfig.siteUrl : ""),
    dataType: "json",
    headers: {
      'Authorization': 'Bearer ' + token,
      'Accept': 'application/json'
    }
  }).done(function (response) {
    window.localStorage.setItem("siteId", response.id);
    cb();
  });
}

// acquire the ids of the lists according their name
function acquireListIds(cb) {
  var siteId = getSiteId();
  if (!siteId) {
    return;
  }

  $.ajax({
    type: "GET",
    url: window.authConfig.endpoints.graph + "/v1.0/sites/" + siteId + "/lists",
    dataType: "json",
    headers: {
      'Authorization': 'Bearer ' + getGraphToken(),
      'Accept': 'application/json'
    }
  }).done(function (response) {
    var lists = response.value;
    var listId = findListId(lists, window.appConfig.list);
    window.localStorage.setItem(window.appConfig.list, findListId(lists, window.appConfig.list));
    window.localStorage.setItem(window.appConfig.documentLibrary, findListId(lists, window.appConfig.documentLibrary));
    cb();
  });
}

// find list id according list name in an array of list.
function findListId(lists, listName) {
  for (var key in lists) {
    var list = lists[key];
    if (list.name === listName) {
      return list.id;
    }
  }
  return null;
}

// get graph token from localStorage
function getGraphToken() {
  return window.localStorage.getItem("graphToken");
}

// get site id from localStorage
function getSiteId() {
  return window.localStorage.getItem("siteId");
}

// get list id according list name from localStorage
function getListId(listName) {
  return window.localStorage.getItem(listName);
}

// get the logged in user'name from localStorage
function getUserName() {
  return window.localStorage.getItem("userName");
}

// get file name from the full file name without the extension
function getFileNameWithoutExtension(fileName) {
  var dotIndex = fileName.indexOf(".");
  if (dotIndex > 0) {
    return fileName.substring(0, dotIndex);
  }
  return fileName;
}
