# SPDX-License-Identifier: Apache-2.0
# Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
import asyncio
import time
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional, Tuple
from urllib.parse import urlparse
import aiosqlite

class BotTrapDetector:
    """
    Manages detection and temporary blacklisting of unresponsive or malicious domains.
    """
    def __init__(self, db_path: str, settings: object):
        self.db_path = db_path
        self.settings = settings
        self.logger = logging.getLogger(__name__)
        
        # Configuration for timeouts and blacklisting
        self.FAILURE_THRESHOLD = 2
        self.BLACKLIST_DURATION_HOURS = 1

    async def _get_db_conn(self):
        return await aiosqlite.connect(self.db_path)

    def _extract_domain(self, url: str) -> Optional[str]:
        if not url or not isinstance(url, str):
            return None
        try:
            return urlparse(url).netloc.replace('www.', '')
        except Exception:
            return None

    async def check_url_before_scraping(self, url: str) -> Tuple[bool, Optional[str]]:
        """
        Checks if a URL's domain is currently blacklisted.
        Returns (should_scrape, skip_reason)
        """
        domain = self._extract_domain(url)
        if not domain:
            return True, None # Allow scraping if domain can't be parsed

        conn = await self._get_db_conn()
        try:
            cursor = await conn.execute(
                "SELECT is_bot_trap, blacklist_until, blacklist_reason FROM domain_trust_profiles WHERE domain = ?",
                (domain,)
            )
            row = await cursor.fetchone()
            await cursor.close()

            if not row:
                return True, None

            if row[0]: # is_bot_trap (permanent)
                reason = row[2] or "Permanently blacklisted"
                self._log_blacklist_hit(domain, reason)
                return False, reason

            if row[1]: # blacklist_until (temporary)
                try:
                    blacklist_until_dt = datetime.fromisoformat(row[1])
                    if datetime.now(timezone.utc) < blacklist_until_dt.replace(tzinfo=timezone.utc):
                        reason = row[2] or "Temporarily blacklisted"
                        self._log_blacklist_hit(domain, reason)
                        return False, reason
                    else:
                        # Blacklist expired, clear it
                        await self._clear_temporary_blacklist(domain, conn)
                except (ValueError, TypeError):
                    # Handle cases where the timestamp is invalid
                    pass
            
            return True, None
        finally:
            await conn.close()

    async def record_timeout_failure(self, url: str, timeout_type: str, duration_s: float):
        """Records a timeout failure and updates the domain's status."""
        domain = self._extract_domain(url)
        if not domain:
            return

        conn = await self._get_db_conn()
        try:
            await conn.execute("BEGIN")
            
            # Log the specific failure
            await conn.execute(
                "INSERT INTO url_failure_log (url, domain, failure_type, response_time_ms, error_details) VALUES (?, ?, ?, ?, ?)",
                (url, domain, timeout_type, int(duration_s * 1000), f"Timeout after {duration_s:.2f}s")
            )

            # Update consecutive timeouts
            cursor = await conn.execute(
                "UPDATE domain_trust_profiles SET consecutive_timeouts = consecutive_timeouts + 1, last_timeout_at = ? WHERE domain = ?",
                (datetime.now(timezone.utc).isoformat(), domain)
            )
            
            if cursor.rowcount == 0:
                # Profile doesn't exist, create it
                await conn.execute(
                    "INSERT OR IGNORE INTO domain_trust_profiles (domain, consecutive_timeouts, last_timeout_at) VALUES (?, 1, ?)",
                    (domain, datetime.now(timezone.utc).isoformat())
                )
            
            await cursor.close()
            
            # Check if blacklisting is needed
            cursor = await conn.execute("SELECT consecutive_timeouts FROM domain_trust_profiles WHERE domain = ?", (domain,))
            row = await cursor.fetchone()
            await cursor.close()
            
            failure_count = row[0] if row else 1
            self._log_timeout_warning(url, timeout_type, duration_s)

            if failure_count >= self.FAILURE_THRESHOLD:
                reason = f"{failure_count} consecutive timeouts"
                await self._blacklist_domain(domain, reason, conn)
                self._log_bot_trap_detection(domain, failure_count)

            await conn.commit()
        except Exception as e:
            await conn.rollback()
            self.logger.error(f"Database error in record_timeout_failure for {domain}: {e}", exc_info=True)
        finally:
            await conn.close()

    async def record_successful_scrape(self, url: str, response_time_ms: int):
        """Resets the timeout counter for a domain upon a successful scrape."""
        domain = self._extract_domain(url)
        if not domain:
            return

        conn = await self._get_db_conn()
        try:
            await conn.execute(
                "UPDATE domain_trust_profiles SET consecutive_timeouts = 0, avg_response_time_ms = ? WHERE domain = ?",
                (response_time_ms, domain)
            )
            await conn.commit()
        finally:
            await conn.close()

    async def _blacklist_domain(self, domain: str, reason: str, conn):
        """Applies a temporary blacklist to a domain."""
        blacklist_until = datetime.now(timezone.utc) + timedelta(hours=self.BLACKLIST_DURATION_HOURS)
        await conn.execute(
            """
            UPDATE domain_trust_profiles
            SET is_temporary_blacklist = 1, blacklist_until = ?, blacklist_reason = ?, auto_blacklisted_at = ?
            WHERE domain = ?
            """,
            (blacklist_until.isoformat(), reason, datetime.now(timezone.utc).isoformat(), domain)
        )

    async def _clear_temporary_blacklist(self, domain: str, conn):
        """Clears an expired temporary blacklist."""
        await conn.execute(
            """
            UPDATE domain_trust_profiles
            SET is_temporary_blacklist = 0, blacklist_until = NULL, consecutive_timeouts = 0, blacklist_reason = 'Expired'
            WHERE domain = ?
            """,
            (domain,)
        )
        self.logger.info(f"Temporary blacklist expired for domain: {domain}")

    def _log_timeout_warning(self, url: str, timeout_type: str, duration: float):
        domain = self._extract_domain(url)
        self.logger.warning(f"⚠️ TIMEOUT ({timeout_type}): {domain} - {duration:.1f}s")
    
    def _log_bot_trap_detection(self, domain: str, failure_count: int):
        self.logger.warning(f"🤖 BOT_TRAP_DETECTED: {domain} - {failure_count} failures - Auto-blacklisted for {self.BLACKLIST_DURATION_HOURS}h")
    
    def _log_blacklist_hit(self, domain: str, reason: str):
        self.logger.info(f"⛔ BLACKLIST_SKIP: {domain} - Reason: {reason}")
