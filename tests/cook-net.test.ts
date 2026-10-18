import { test } from "node:test";
import assert from "node:assert/strict";
import { checkImportUrl, isPrivateAddress } from "../src/lib/cook/net.ts";

test("isPrivateAddress", () => {
  for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "::1", "::", "fd00::1", "fe80::1", "::ffff:10.0.0.1", "not-an-ip"]) {
    assert.equal(isPrivateAddress(ip), true, ip);
  }
  for (const ip of ["8.8.8.8", "172.32.0.1", "151.101.1.200", "2606:4700::1111", "::ffff:8.8.8.8"]) {
    assert.equal(isPrivateAddress(ip), false, ip);
  }
});

test("checkImportUrl", () => {
  assert.ok(checkImportUrl("https://cookpad.com/recipe/123").ok);
  assert.ok(checkImportUrl(" http://example.com/a?b=1 ").ok);
  for (const bad of ["ftp://x.com", "javascript:alert(1)", "https://user:pw@x.com", "https://x.com:8080/", "http://localhost/", "http://127.0.0.1/", "http://[::1]/", "http://169.254.169.254/latest", "http://foo.internal/", "とても"]) {
    assert.equal(checkImportUrl(bad).ok, false, bad);
  }
});
