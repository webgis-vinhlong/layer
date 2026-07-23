//! Dependency-free catalog invariant checker used by CI.

use std::{env, fs, process};

fn json_number(document: &str, key: &str) -> Option<u64> {
    let marker = format!("\"{}\"", key);
    let start = document.find(&marker)? + marker.len();
    let tail = &document[start..];
    let colon = tail.find(':')? + 1;
    let digits: String = tail[colon..]
        .chars()
        .skip_while(|c| c.is_whitespace())
        .take_while(|c| c.is_ascii_digit())
        .collect();
    digits.parse().ok()
}

fn main() {
    let path = env::args()
        .nth(1)
        .unwrap_or_else(|| "data/catalog.json".to_string());
    let document = fs::read_to_string(&path).unwrap_or_else(|error| {
        eprintln!("cannot read {path}: {error}");
        process::exit(2);
    });
    let checks = [
        ("categories", 19),
        ("layers", 103),
        ("features", 35_017),
        ("sourceFeatures", 36_643),
        ("invalidGeometries", 1_626),
    ];
    let mut ok = true;
    for (key, expected) in checks {
        let actual = json_number(&document, key);
        if actual != Some(expected) {
            eprintln!("{key}: expected {expected}, got {actual:?}");
            ok = false;
        }
    }
    let layer_records = document.matches("\"primaryCategoryId\"").count();
    if layer_records != 103 {
        eprintln!("layer records: expected 103, got {layer_records}");
        ok = false;
    }
    if !ok {
        process::exit(1);
    }
    println!(
        "{{\"status\":\"ok\",\"catalog\":\"{}\",\"layers\":103,\"features\":35017}}",
        path
    );
}
