# Конторка

<!-- impeccable:product-schema 1 -->

## Platform

web

## Product Purpose

A Russian-language PDF signing and filling service at zapdf.ru. The previous gamelife.shop address stays available during migration so existing local browser data and signing links remain accessible.

## Users

People filling and signing their own PDFs, including forms, applications and contracts. The user explicitly confirmed this as the primary homepage scenario on 2026-10-31. Invitations remain available as a secondary action.

## Capabilities and Constraints

React/Vite application with a Node backend, Docker and GitHub Actions. For self-editing, PDFs and images stay in the browser; Word and Excel files are temporarily sent to an isolated server-side converter and removed after processing. Files up to 50 MB and 100 PDF pages. Add uploaded or drawn signatures, stamps, editable overlays, checks and pages; extract a signature from a page, adjust its background, scale and angle; apply page filters or perspective correction; download the result. A filtered, covered or perspective-corrected page is rasterized, so searchable text and interactive content on it are not preserved. The cover is not a guaranteed secure redaction mechanism. Without an account, saved signatures and texts stay in this browser; signed-in users can save them on the server and copy existing local assets into their account. Added text exports as an image. The service does not replace or edit original PDF text.

Invitations create separate links for up to ten sequential signers and upload the document to the server for seven days; invitation emails are not sent automatically. Login codes are sent through the configured SpaceWeb SMTP account. The visual signature is not a qualified electronic signature. The editor can be used without registration or payment.

## Brand Commitments

Name: Конторка. Clear everyday Russian. Use the supplied brand identity: blue #0B57D0, graphite #182028, light blue #EAF2FF, white, and Inter. The public domain remains zapdf.ru. Retain the original colours in user documents and signatures. Editor and invitation behavior must continue working.

## Evidence on Hand

Working editor and synthetic demonstration documents. No verified user counts, testimonials, security certifications or speed guarantees: do not invent them. Do not publish user-uploaded private document examples.

## Product Principles

- Let visitors open a PDF immediately.
- Explain capabilities through working examples.
- Distinguish local editing from server-backed signing links.
- Keep templates optional and preserve current editing workflows.
