"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");

const webRoot = path.resolve(process.argv[2]);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
  const requestedFile = path.resolve(webRoot, `.${pathname}`);

  if (!requestedFile.startsWith(`${webRoot}${path.sep}`) || !fs.existsSync(requestedFile)) {
    response.writeHead(404);
    response.end("Nicht gefunden");
    return;
  }

  response.writeHead(200, {
    "Content-Type": mimeTypes[path.extname(requestedFile).toLowerCase()] ||
      "application/octet-stream",
    "Cache-Control": "no-store",
  });
  fs.createReadStream(requestedFile).pipe(response);
});

async function main() {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.BW_BROWSER_EXE || undefined,
  });
  const page = await browser.newPage({ locale: "de-CH", viewport: { width: 1280, height: 900 } });
  const pageErrors = [];
  const failedRequests = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("requestfailed", (request) => failedRequests.push(request.url()));

  try {
    await page.goto(`${baseUrl}/index.html`, { waitUntil: "load" });
    await page.waitForFunction(() =>
      document.getElementById("status")?.textContent?.startsWith("Bereit."),
    );

    assert.equal(await page.title(), "Barrierefreies Wörterbuch 1.0.0");
    assert.equal(await page.locator(".header-copy p").textContent(), "Version 1.0.0");
    assert.equal(await page.locator("#localeCH").isChecked(), true);
    assert.equal(await page.locator("table").count(), 0);
    assert.equal(await page.locator(".app-logo").evaluate((image) => image.complete && image.naturalWidth > 0), true);

    const appearance = await page.evaluate(() => ({
      backgroundAttachment: getComputedStyle(document.documentElement).backgroundAttachment,
      queryBackground: getComputedStyle(document.getElementById("query")).backgroundColor,
      buttonBackground: getComputedStyle(document.getElementById("searchButton")).backgroundColor,
    }));
    assert.match(appearance.backgroundAttachment, /fixed/);
    assert.equal(appearance.queryBackground, "rgb(255, 255, 255)");
    assert.equal(appearance.buttonBackground, "rgb(255, 255, 255)");

    await page.locator("#query").fill("Karussell");
    await page.locator("#query").press("Enter");
    await page.locator("#wordHeading").waitFor({ state: "visible" });
    assert.equal(await page.locator("#wordHeading").textContent(), "Karussell");
    assert.equal(await page.locator("#hyphenation").textContent(), "Ka-rus-sell");
    assert.match(await page.locator("#status").textContent(), /Karussell gefunden/);

    await page.locator("#query").fill("Karusell");
    await page.locator("#query").press("Enter");
    await page.locator("#suggestions button").filter({ hasText: "Karussell" }).waitFor();
    await page.locator("#suggestions button").filter({ hasText: "Karussell" }).click();
    assert.equal(await page.locator("#wordHeading").textContent(), "Karussell");

    await page.locator("#query").fill("Strasse");
    await page.locator("#query").press("Enter");
    await page.locator("#wordHeading").filter({ hasText: "Strasse" }).waitFor();
    assert.equal(await page.locator("#hyphenation").textContent(), "Stras-se");

    await page.locator("#settingsSummary").click();
    await page.locator("#localeDE").check();
    await page.locator("#query").fill("Straße");
    await page.locator("#query").press("Enter");
    await page.locator("#wordHeading").filter({ hasText: "Straße" }).waitFor();
    assert.equal(await page.locator("#hyphenation").textContent(), "Stra-ße");

    await page.locator("#aboutOpen").click();
    assert.equal(await page.locator("#aboutDialog").evaluate((dialog) => dialog.open), true);
    assert.match(await page.locator("#aboutDialog").textContent(), /Alessandro Fabiano/);
    assert.match(await page.locator("#aboutDialog").textContent(), /OpenAI Codex/);
    await page.keyboard.press("Escape");
    assert.equal(await page.locator("#aboutDialog").evaluate((dialog) => dialog.open), false);

    assert.deepEqual(pageErrors, []);
    assert.deepEqual(failedRequests, []);

    process.stdout.write(JSON.stringify({
      result: "OK",
      version: "1.0.0",
      tested: [
        "lokaler Start",
        "Karussell",
        "Karusell-Vorschlag",
        "Deutsch Schweiz/Deutschland",
        "Dialog",
        "Logo",
        "Darstellung",
      ],
    }));
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  console.error(error);
  server.close();
  process.exitCode = 1;
});
