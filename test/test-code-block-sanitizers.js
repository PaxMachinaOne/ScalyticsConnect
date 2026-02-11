// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
/**
 * Test script for code block sanitization in model responses
 * 
 * This script verifies that our model sanitizers correctly handle
 * common code block formatting issues in model responses, particularly:
 * 1. Language tags attached directly to code without newlines
 * 2. Improper indentation in code blocks
 * 3. Special language-specific formatting issues
 */

// Instead of requiring the whole filter modules (which depend on tokenizers),
// let's directly extract just the functions we need for testing
const { fixCodeBlocks: phiFixCodeBlocks } = require('../src/models/prompting/filters/phiFilter');
const { fixCodeBlocks: mistralFixCodeBlocks } = require('../src/models/prompting/filters/mistralFilter');

// Create simplified version of sanitize that only uses the fixCodeBlocks function
function phiSanitize(response) {
  if (!response) return '';
  
  // Fix code blocks with language tags attached directly to code
  let cleanedResponse = phiFixCodeBlocks(response);
  
  // Fix code blocks that start or end with too many backticks (common in Phi models)
  cleanedResponse = cleanedResponse.replace(/````(`*)([\s\S]*?)````(`*)/g, '```$2```');
  
  // Fix excessive newlines in responses (common in Phi)
  cleanedResponse = cleanedResponse.replace(/\n{3,}/g, '\n\n');
  
  return cleanedResponse.trim();
}

function mistralSanitize(response) {
  if (!response) return '';
  
  // Fix code blocks with language tags attached directly to code
  let cleanedResponse = mistralFixCodeBlocks(response);
  
  // Fix German instruction headers formatting
  cleanedResponse = cleanedResponse.replace(/^\*\*(Anleitung|Aufgabe|Beschreibung|Beispiel|Hinweise|Lösung):\*\*(?!\n\n)/gmi, 
    match => match + "\n\n");
  
  // Fix excessive newlines
  cleanedResponse = cleanedResponse.replace(/\n{3,}/g, '\n\n');
  
  return cleanedResponse.trim();
}

// Test cases for Phi models
const phiTestCases = [
  // Phi-4 Go code example with language tag attached to code
  {
    name: "Phi-4 Go code with no newline after language tag",
    input: "|```gopackage mainimport (\n \"fmt\"\n)\n\n// Define your API handlers here, for example:\nfunc GetItem(w http.ResponseWriter, r *http.Request) {\n // Implement the logic to retrieve an item based on request parameters.\n}\n\nfunc CreateItem(w http.ResponseWriter, r *http.Request) {\n // Implement the logic to create a new item from incoming data in `r`.\n}\n\n// You can add more handlers for Update and Delete as well.\n\n// Main function where we set up our routesfunc main() {\n http.HandleFunc(\"/items\", GetItems)\n http.HandleFunc(\"/items/new\", CreateItem)\n\n fmt.Println(\"API server started on :8080\")\n err := http.ListenAndServe(\":8080\", nil) // Listen and serve on port8080.\n if err != nil {\n panic(err) // Handle the error in a real-world application appropriately }\n}\n```",
    expected: "```go\npackage main\nimport (\n \"fmt\"\n)\n\n// Define your API handlers here, for example:\nfunc GetItem(w http.ResponseWriter, r *http.Request) {\n // Implement the logic to retrieve an item based on request parameters.\n}\n\nfunc CreateItem(w http.ResponseWriter, r *http.Request) {\n // Implement the logic to create a new item from incoming data in `r`.\n}\n\n// You can add more handlers for Update and Delete as well.\n\n// Main function where we set up our routes\nfunc main() {\n http.HandleFunc(\"/items\", GetItems)\n http.HandleFunc(\"/items/new\", CreateItem)\n\n fmt.Println(\"API server started on :8080\")\n err := http.ListenAndServe(\":8080\", nil) // Listen and serve on port8080.\n if err != nil {\n panic(err) // Handle the error in a real-world application appropriately }\n}\n```"
  },
  // Phi model with excessive backticks
  {
    name: "Phi model with excessive backticks",
    input: "Here's a Python example:\n\n``````python\ndef hello_world():\n    print(\"Hello, world!\")\n``````",
    expected: "Here's a Python example:\n\n```python\ndef hello_world():\n    print(\"Hello, world!\")\n```"
  }
];

// Test cases for Mistral models
const mistralTestCases = [
  // Mistral example with Python code and no newline after language tag
  {
    name: "Mistral Python code with no newline after language tag",
    input: "**Anleitung:**\n1. Erstellt eine Liste von Temperaturmesswerten, die Rauschen enthalten.\n2. Schreibt eine Funktion, die den Durchschnitt der letzten n Messwerte berechnet (beispielsweise die letzten5 Werte).\n3. Gebt die geglätteten Temperaturwerte aus.\n\n```python# Beispiel-Lösungimport random# Generiert eine Liste von Temperaturmesswerten mit Rauschentemperature_data = [22 + random.uniform(-2,2) for _ in range(100)]\n\ndef smooth_temperature(data, window_size):\n smoothed_data = []\n for i in range(len(data)):\n if i < window_size -1:\n smoothed_data.append(sum(data[:i+1]) / (i +1))\n else:\n smoothed_data.append(sum(data[i-window_size+1:i+1]) / window_size)\n return smoothed_data# Glättet die Temperaturdaten mit einem Fenster von Größe5smoothed_temperatures = smooth_temperature(temperature_data,5)\n\n# Gebt die geglätteten Temperaturwerte ausfor i in range(len(smoothed_temperatures)):\n print(f\"Original: {temperature_data[i]:.2f}, Geglättet: {smoothed_temperatures[i]:.2f}\")\n```",
    expected: "**Anleitung:**\n\n1. Erstellt eine Liste von Temperaturmesswerten, die Rauschen enthalten.\n2. Schreibt eine Funktion, die den Durchschnitt der letzten n Messwerte berechnet (beispielsweise die letzten5 Werte).\n3. Gebt die geglätteten Temperaturwerte aus.\n\n```python\n# Beispiel-Lösung\nimport random\n# Generiert eine Liste von Temperaturmesswerten mit Rauschen\ntemperature_data = [22 + random.uniform(-2,2) for _ in range(100)]\n\ndef smooth_temperature(data, window_size):\n smoothed_data = []\n for i in range(len(data)):\n if i < window_size -1:\n smoothed_data.append(sum(data[:i+1]) / (i +1))\n else:\n smoothed_data.append(sum(data[i-window_size+1:i+1]) / window_size)\n return smoothed_data\n# Glättet die Temperaturdaten mit einem Fenster von Größe5\nsmoothed_temperatures = smooth_temperature(temperature_data,5)\n\n# Gebt die geglätteten Temperaturwerte aus\nfor i in range(len(smoothed_temperatures)):\n print(f\"Original: {temperature_data[i]:.2f}, Geglättet: {smoothed_temperatures[i]:.2f}\")\n```"
  },
  // German formatted text without proper spacing
  {
    name: "Mistral German text without proper spacing after headers",
    input: "**Anleitung:**Hier ist die Aufgabe.\n1. Schritt eins\n2. Schritt zwei",
    expected: "**Anleitung:**\n\nHier ist die Aufgabe.\n1. Schritt eins\n2. Schritt zwei"
  }
];

// Run tests
function runTests() {
  console.log("=== Testing Phi Model Sanitizer ===");
  
  phiTestCases.forEach((testCase, index) => {
    console.log(`\n[Test ${index + 1}] ${testCase.name}`);
    
    // Apply the sanitizer
    const sanitized = phiSanitize(testCase.input);
    
    // Check if output matches expected
    const passed = sanitized === testCase.expected;
    console.log(`Result: ${passed ? 'PASSED ✓' : 'FAILED ✗'}`);
    
    if (!passed) {
      console.log("\nExpected:");
      console.log("---------");
      console.log(testCase.expected);
      console.log("\nActual:");
      console.log("-------");
      console.log(sanitized);
      
      // Find the first difference
      let i = 0;
      while (i < Math.min(sanitized.length, testCase.expected.length) && 
             sanitized[i] === testCase.expected[i]) {
        i++;
      }
      console.log(`\nFirst difference at position ${i}:`);
      console.log(`Expected: '${testCase.expected.substring(i, i+20)}...'`);
      console.log(`Actual:   '${sanitized.substring(i, i+20)}...'`);
    }
  });
  
  console.log("\n\n=== Testing Mistral Model Sanitizer ===");
  
  mistralTestCases.forEach((testCase, index) => {
    console.log(`\n[Test ${index + 1}] ${testCase.name}`);
    
    // Apply the sanitizer
    const sanitized = mistralSanitize(testCase.input);
    
    // Check if output matches expected
    const passed = sanitized === testCase.expected;
    console.log(`Result: ${passed ? 'PASSED ✓' : 'FAILED ✗'}`);
    
    if (!passed) {
      console.log("\nExpected:");
      console.log("---------");
      console.log(testCase.expected);
      console.log("\nActual:");
      console.log("-------");
      console.log(sanitized);
      
      // Find the first difference
      let i = 0;
      while (i < Math.min(sanitized.length, testCase.expected.length) && 
             sanitized[i] === testCase.expected[i]) {
        i++;
      }
      console.log(`\nFirst difference at position ${i}:`);
      console.log(`Expected: '${testCase.expected.substring(i, i+20)}...'`);
      console.log(`Actual:   '${sanitized.substring(i, i+20)}...'`);
    }
  });
}

// Run the tests
runTests();
