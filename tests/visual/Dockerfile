# The one place the visual regression suite runs.
#
# Everything runs in here, locally and in CI, so the pixels are a property
# of this image rather than of whoever ran the tests. The cost is a large
# first pull and a slower edit-run loop than native; what it buys is that
# "works on my machine" cannot happen.
#
# **Browsers are deliberately not pinned.** Every one of the five is
# fetched at build time from its vendor's current release, so `stable`
# means whatever the vendors currently ship and `beta` means whatever is
# currently in beta. A browser release that changes rendering will show up
# as a baseline diff, and for a Mozilla property that signal is one of the
# more valuable things this suite produces — so it is a feature, not noise
# to be engineered away. Rebuild the image to pick up newer browsers; the
# run prints the five versions so a baseline can be read against them.
#
# The base image tag is pinned only because it carries Playwright's own
# harness and its bundled builds, which have to match the `@playwright/test`
# in `package.json`. That pin is about the driver, not about the browsers
# under test — note that the bundled Firefox and WebKit are frozen to
# Playwright's release cadence and would drift from real stable, which is
# exactly why the Firefox in the matrix is the real one below rather than
# the bundled build.
FROM mcr.microsoft.com/playwright:v1.63.0-noble

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

# `xz-utils` for the Mozilla tarballs; not in the base image, and `tar -J`
# fails without it with a message about not being able to exec `xz` rather
# than anything about the archive.
RUN apt-get update \
  && apt-get install -y --no-install-recommends xz-utils gnupg \
  && rm -rf /var/lib/apt/lists/*

# Google Chrome stable and beta, from Google's own repository.
#
# Playwright's bundled Chromium is deliberately not what the matrix uses:
# it runs ahead of the stable channel, so it answers "what will Chrome do
# soon" rather than "what do users see". `channel: 'chrome'` needs the real
# thing, which is this.
#
# Unpinned on purpose, and Google's repository could not honour a pin
# anyway — it keeps only the current build of each channel, so an `=`
# version would stop resolving the day they publish the next one.
RUN curl -fsSL https://dl.google.com/linux/linux_signing_key.pub \
    | gpg --dearmor -o /usr/share/keyrings/google-chrome.gpg \
  && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/google-chrome.gpg] https://dl.google.com/linux/chrome/deb/ stable main" \
    > /etc/apt/sources.list.d/google-chrome.list \
  && apt-get update \
  && apt-get install -y --no-install-recommends \
    google-chrome-stable \
    google-chrome-beta \
  && rm -rf /var/lib/apt/lists/*

# Firefox stable and beta, unpacked where Playwright's `moz-firefox` and
# `moz-firefox-beta` channels look for them.
#
# The stable one is the real Mozilla release rather than Playwright's
# bundled build, which is the whole point: the bundled Firefox is whatever
# shipped with this Playwright version and is already a release behind, so
# it could not answer "how does Firefox render this today".
#
# Both channels drive the browser over WebDriver BiDi rather than the
# patched-Firefox path the bundled build uses. That is a less mature
# transport — see `runner/browsers.ts`.
#
# `os=linux64-aarch64` or `os=linux64` by build architecture, so the image
# builds on an Apple Silicon laptop and on an x86 CI runner from one file.
# `moz-firefox` expects `/snap/bin/firefox`, which is a snap path on a
# normal Ubuntu box; here it is an ordinary symlink to the unpacked build.
RUN arch="$(dpkg --print-architecture)" \
  && case "$arch" in \
    arm64) mozos=linux64-aarch64 ;; \
    amd64) mozos=linux64 ;; \
    *) echo "No Firefox build for $arch" >&2; exit 1 ;; \
  esac \
  && for channel in latest beta; do \
    case "$channel" in \
      latest) product=firefox-latest-ssl; target=/opt/firefox ;; \
      beta) product=firefox-beta-latest-ssl; target=/opt/firefox-beta ;; \
    esac; \
    curl -fsSL -o /tmp/firefox.tar.xz \
      "https://download.mozilla.org/?product=${product}&os=${mozos}&lang=en-US" \
    && tar -xJf /tmp/firefox.tar.xz -C /tmp \
    && mv /tmp/firefox "$target" \
    && rm /tmp/firefox.tar.xz; \
  done \
  && mkdir -p /snap/bin \
  && ln -s /opt/firefox/firefox /snap/bin/firefox

# corepack, so the container uses the pnpm version `package.json` pins
# rather than whatever is globally installed.
RUN corepack enable

WORKDIR /work
