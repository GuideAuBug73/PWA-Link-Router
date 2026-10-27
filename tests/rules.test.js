const test = require("node:test");
const assert = require("node:assert");
const { routeTarget, hostMatches, withDefaults } = require("../extension/rules.js");

const OUTLOOK = "https://outlook.office.com/mail/inbox/id/AAMk";
const TEAMS = "https://teams.microsoft.com/v2/";
const settings = withDefaults();

test("external links are routed", () => {
  assert.strictEqual(routeTarget("https://example.com/a?b=1", OUTLOOK, settings), "https://example.com/a?b=1");
  assert.strictEqual(routeTarget("http://github.com", TEAMS, settings), "http://github.com/");
});

test("Safe Links wrappers are routed", () => {
  const url = "https://eur01.safelinks.protection.outlook.com/?url=https%3A%2F%2Fexample.com";
  assert.strictEqual(routeTarget(url, OUTLOOK, settings), url);
});

test("links inside the app stay in Edge", () => {
  assert.strictEqual(routeTarget("/mail/sentitems", OUTLOOK, settings), null);
  assert.strictEqual(routeTarget("https://outlook.office.com/calendar", OUTLOOK, settings), null);
});

test("other Microsoft apps and sign-in pages stay in Edge", () => {
  assert.strictEqual(routeTarget("https://teams.microsoft.com/l/meetup-join/xyz", OUTLOOK, settings), null);
  assert.strictEqual(routeTarget("https://login.microsoftonline.com/common/oauth2", TEAMS, settings), null);
});

test("non-web schemes are left alone", () => {
  for (const url of ["mailto:a@b.c", "javascript:void(0)", "ms-teams://x", "tel:123", "blob:https://outlook.office.com/x"]) {
    assert.strictEqual(routeTarget(url, OUTLOOK, settings), null, url);
  }
});

test("disabled extension routes nothing", () => {
  assert.strictEqual(routeTarget("https://example.com", OUTLOOK, withDefaults({ enabled: false })), null);
});

test("host patterns", () => {
  assert.ok(hostMatches("contoso.sharepoint.com", "*.sharepoint.com"));
  assert.ok(hostMatches("sharepoint.com", "*.sharepoint.com"));
  assert.ok(!hostMatches("evilsharepoint.com", "*.sharepoint.com"));
  assert.ok(hostMatches("Example.COM", "example.com"));
  assert.ok(!hostMatches("www.example.com", "example.com"));
  assert.ok(!hostMatches("example.com", "  "));
});

test("custom keep list", () => {
  const custom = withDefaults({ keepInEdge: ["*.sharepoint.com"] });
  assert.strictEqual(routeTarget("https://contoso.sharepoint.com/doc", TEAMS, custom), null);
  assert.strictEqual(routeTarget("https://login.microsoftonline.com/", TEAMS, custom), "https://login.microsoftonline.com/");
});

test("works without a page URL", () => {
  assert.strictEqual(routeTarget("https://example.com/x", "", settings), "https://example.com/x");
  assert.strictEqual(routeTarget("/relative", "", settings), null);
});
