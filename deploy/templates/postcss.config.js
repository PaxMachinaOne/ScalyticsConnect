// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
// PostCSS Configuration for Tailwind CSS v3.3.3
module.exports = {
  plugins: {
    // The order matters: Tailwind CSS processes CSS before Autoprefixer
    tailwindcss: {},
    autoprefixer: {},
  }
}
