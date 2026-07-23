// Fast line-oriented validator for the normalized GeoJSONL streams.
#include <fstream>
#include <iostream>
#include <string>
#include <vector>

int main(int argc, char** argv) {
  if (argc < 2) {
    std::cerr << "usage: geometry_sanity file.geojsonl [...]\n";
    return 2;
  }
  std::size_t total = 0;
  for (int index = 1; index < argc; ++index) {
    std::ifstream input(argv[index]);
    if (!input) {
      std::cerr << "cannot read " << argv[index] << '\n';
      return 2;
    }
    std::string line;
    std::size_t lines = 0;
    while (std::getline(input, line)) {
      ++lines;
      if (line.find("\"type\":\"Feature\"") == std::string::npos ||
          line.find("\"_layer_id\":") == std::string::npos ||
          line.find("\"coordinates\":") == std::string::npos) {
        std::cerr << argv[index] << ':' << lines
                  << " is not a normalized feature\n";
        return 1;
      }
    }
    total += lines;
    std::cout << argv[index] << ": " << lines << " features\n";
  }
  if (total != 35017) {
    std::cerr << "expected 35017 normalized features, got " << total << '\n';
    return 1;
  }
  std::cout << "geometry streams: ok\n";
  return 0;
}
