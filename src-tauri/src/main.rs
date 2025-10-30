// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
  // Load environment variables from a local .env file if present (development convenience)
  // This allows reading values like OPENAI_API_KEY via std::env::var at runtime.
  let _ = dotenvy::dotenv();
  app_lib::run();
}
