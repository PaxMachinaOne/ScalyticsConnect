# SPDX-License-Identifier: Apache-2.0
# Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
import fcntl
import logging
import os
import time

logger = logging.getLogger(__name__)

class FileLock:
    def __init__(self, lock_file_path, timeout=30, delay=0.5):
        self.lock_file_path = lock_file_path
        self.timeout = timeout
        self.delay = delay
        self._lock_file = None

    def __enter__(self):
        start_time = time.time()
        while True:
            try:
                self._lock_file = open(self.lock_file_path, 'w')
                fcntl.flock(self._lock_file, fcntl.LOCK_EX | fcntl.LOCK_NB)
                logger.debug(f"Process {os.getpid()} acquired lock on {self.lock_file_path}.")
                return self
            except (IOError, BlockingIOError):
                if self._lock_file:
                    self._lock_file.close()
                if time.time() - start_time >= self.timeout:
                    logger.error(f"Process {os.getpid()} timed out after {self.timeout}s waiting for lock on {self.lock_file_path}.")
                    raise TimeoutError(f"Could not acquire lock on {self.lock_file_path} within {self.timeout} seconds.")
                time.sleep(self.delay)
            except Exception as e:
                logger.error(f"An unexpected error occurred while acquiring lock for process {os.getpid()}: {e}", exc_info=True)
                if self._lock_file:
                    self._lock_file.close()
                raise

    def __exit__(self, exc_type, exc_val, exc_tb):
        if self._lock_file:
            try:
                fcntl.flock(self._lock_file, fcntl.LOCK_UN)
                self._lock_file.close()
                self._lock_file = None
                logger.debug(f"Process {os.getpid()} released lock on {self.lock_file_path}.")
                try:
                    os.remove(self.lock_file_path)
                except OSError:
                    pass
            except Exception as e:
                logger.error(f"An error occurred while releasing lock for process {os.getpid()}: {e}", exc_info=True)

def setup_logger(name, level=logging.INFO):
    """Function to set up a logger."""
    logger = logging.getLogger(name)
    
    # Map string level to logging constants
    log_level = level
    if isinstance(level, str):
        log_level = getattr(logging, level.upper(), logging.INFO)
        
    logger.setLevel(log_level)
    handler = logging.StreamHandler()
    formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
    handler.setFormatter(formatter)
    if not logger.handlers:
        logger.addHandler(handler)
    return logger
