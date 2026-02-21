#!/bin/bash
# SPDX-License-Identifier: Apache-2.0
# Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)

BOLD="\033[1m"
RESET="\033[0m"
BLUE="\033[34m"
GREEN="\033[32m"
YELLOW="\033[33m"
RED="\033[31m"
PURPLE="\033[35m"
CYAN="\033[36m"

FRONTEND_DIR="frontend"
LOG_DIR="." 
BACKEND_LOG="$LOG_DIR/backend.log"
FRONTEND_LOG="$LOG_DIR/frontend.log"
PYTHON_SERVICE_LOG="$LOG_DIR/python_service.log"

UVICORN_WORKER_ARGS=""
export PYTHON_DEEP_SEARCH_SCRAPE_CONCURRENCY=2 

if [ "$1" == "--dev" ]; then
  echo -e "${YELLOW}Development mode activated: Python service will run with 2 workers and scrape concurrency of 2.${RESET}"
  UVICORN_WORKER_ARGS="--workers 2"
  export PYTHON_DEEP_SEARCH_SCRAPE_CONCURRENCY=2
else
  :
fi

check_directory() {
  if [ ! -d "$1" ]; then
    echo -e "${RED}Error: $1 directory not found${RESET}"
    echo "Please make sure you run this script from the WMCP directory"
    exit 1
  fi
}

check_node_modules() {
  if [ ! -d "$1/node_modules" ]; then
    echo -e "${YELLOW}Warning: node_modules not found in $1. Running npm install...${RESET}"
    
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    
    npm install --prefix="$1"
  fi
}

cleanup() {
  echo -e "\n${YELLOW}Shutting down servers...${RESET}"
  
  if [ -n "$BACKEND_PID" ]; then
    echo -e "${BLUE}Stopping backend server (PID: $BACKEND_PID)${RESET}"
    kill $BACKEND_PID 2>/dev/null
  fi
  
  if [ -n "$FRONTEND_PID" ]; then
    echo -e "${GREEN}Stopping frontend server (PID: $FRONTEND_PID)${RESET}"
    kill $FRONTEND_PID 2>/dev/null
  fi
  
  if [ -n "$PYTHON_SERVICE_PID" ]; then
    echo -e "${CYAN}Stopping Python FastAPI service (PID: $PYTHON_SERVICE_PID)${RESET}"
    kill $PYTHON_SERVICE_PID 2>/dev/null
  fi

  if [ -n "$LOG_MONITOR_PID" ]; then
    kill $LOG_MONITOR_PID 2>/dev/null
  fi
  
  pkill -f "node.*$(pwd)" 2>/dev/null
  
  echo -e "${BOLD}WMCP servers stopped${RESET}"
  exit 0
}

trap cleanup SIGINT

echo -e "${YELLOW}Ensuring all previous server processes are stopped...${RESET}"
pkill -f "npm start --prefix=$(pwd)"
pkill -f "npm start --prefix=$FRONTEND_DIR"
pkill -f "uvicorn src.python_services.deep_search_service.main:app"
sleep 2

echo -e "${BOLD}=============================================================${RESET}"
echo -e "${BOLD}  🚀 Starting Scalytics Copilot Server${RESET}"
echo -e "${BOLD}=============================================================${RESET}"
echo

check_directory "$FRONTEND_DIR"

check_node_modules "." 
check_node_modules "$FRONTEND_DIR"  

echo -e "${CYAN}Using existing Tailwind CSS configuration...${RESET}"

echo "=== Backend Log $(date) ===" > $BACKEND_LOG
echo "=== Frontend Log $(date) ===" > $FRONTEND_LOG
echo "=== Python FastAPI Service Log $(date) ===" > $PYTHON_SERVICE_LOG

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
if command -v nvm &>/dev/null; then
  nvm use 23.9.0 &>/dev/null || nvm use default &>/dev/null
fi

echo -e "${BLUE}Starting backend server...${RESET}"
npm start --prefix="$(pwd)" > $BACKEND_LOG 2>&1 &
BACKEND_PID=$!

sleep 3 

if ! ps -p $BACKEND_PID > /dev/null; then
  echo -e "${RED}Failed to start backend server. Check $BACKEND_LOG for details.${RESET}"
  cat $BACKEND_LOG 
  exit 1
fi
echo -e "${BLUE}Backend server started (PID: $BACKEND_PID)${RESET}"

echo -e "${CYAN}Starting Python FastAPI service...${RESET}"
CERTIFI_PATH=$($(pwd)/venv/bin/python3 -m certifi) 
SSL_CERT_FILE="$CERTIFI_PATH" $(pwd)/venv/bin/python3 -m uvicorn src.python_services.deep_search_service.main:app --host 0.0.0.0 --port 8001 --reload --log-level debug $UVICORN_WORKER_ARGS > $PYTHON_SERVICE_LOG 2>&1 &
PYTHON_SERVICE_PID=$!

sleep 15 

if ! ps -p $PYTHON_SERVICE_PID > /dev/null; then
  echo -e "${RED}Failed to start Python FastAPI service. Check $PYTHON_SERVICE_LOG for details.${RESET}"
  cat $PYTHON_SERVICE_LOG 
  kill $BACKEND_PID 
  exit 1
fi
echo -e "${CYAN}Python FastAPI service started (PID: $PYTHON_SERVICE_PID)${RESET}"

echo -e "${GREEN}Starting frontend server in $FRONTEND_DIR...${RESET}"
npm start --prefix="$FRONTEND_DIR" > $FRONTEND_LOG 2>&1 &
FRONTEND_PID=$!

sleep 3 

if ! ps -p $FRONTEND_PID > /dev/null; then
  echo -e "${RED}Failed to start frontend server. Check $FRONTEND_LOG for details.${RESET}"
  cat $FRONTEND_LOG 
  kill $BACKEND_PID
  kill $PYTHON_SERVICE_PID 
  exit 1
fi
echo -e "${GREEN}Frontend server started (PID: $FRONTEND_PID)${RESET}"


echo -e "${BOLD}All three servers started successfully!${RESET}"
echo -e "${BLUE}Backend server running with PID: $BACKEND_PID${RESET}"
echo -e "${CYAN}Python FastAPI service running with PID: $PYTHON_SERVICE_PID (Port: 8001)${RESET}"
echo -e "${GREEN}Frontend server running with PID: $FRONTEND_PID${RESET}"
echo
echo -e "${BOLD}Access the application at:${RESET}"
echo -e "  Frontend: ${GREEN}http://localhost:3001${RESET}"
echo -e "  Backend API: ${BLUE}http://localhost:3000/api${RESET}"
echo
echo -e "${YELLOW}Press Ctrl+C to stop all servers${RESET}"
echo -e "${PURPLE}== ADMIN CREDENTIALS ===${RESET}"
echo -e "${PURPLE}Username: admin${RESET}"
echo -e "${PURPLE}Password: admin123${RESET}"
echo -e "${BOLD}=============================================================${RESET}"
echo

monitor_logs() {
  BACKEND_PIPE=$(mktemp -u)_backend_pipe
  FRONTEND_PIPE=$(mktemp -u)_frontend_pipe
  PYTHON_SERVICE_PIPE=$(mktemp -u)_python_pipe
  mkfifo $BACKEND_PIPE $FRONTEND_PIPE $PYTHON_SERVICE_PIPE
  
  tail -f $BACKEND_LOG > $BACKEND_PIPE &
  BACKEND_TAIL_PID=$!
  
  tail -f $FRONTEND_LOG > $FRONTEND_PIPE &
  FRONTEND_TAIL_PID=$!

  tail -f $PYTHON_SERVICE_LOG > $PYTHON_SERVICE_PIPE &
  PYTHON_TAIL_PID=$!
  
  cat $BACKEND_PIPE | while read -r line; do echo -e "${BLUE}[Backend]${RESET} $line"; done &
  
  cat $FRONTEND_PIPE | while read -r line; do echo -e "${GREEN}[Frontend]${RESET} $line"; done &

  cat $PYTHON_SERVICE_PIPE | while read -r line; do echo -e "${CYAN}[PythonSvc]${RESET} $line"; done &
  
  wait $BACKEND_TAIL_PID $FRONTEND_TAIL_PID $PYTHON_TAIL_PID
  
  rm -f $BACKEND_PIPE $FRONTEND_PIPE $PYTHON_SERVICE_PIPE
}

monitor_logs &
LOG_MONITOR_PID=$!

wait $BACKEND_PID $PYTHON_SERVICE_PID $FRONTEND_PID

cleanup
