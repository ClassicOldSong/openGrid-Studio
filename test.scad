use <opengrid_generator.scad>

mask = [
  [5, 1, 1, 1, 1, 1, 4],
  [1, 1, 0, 0, 0, 1, 0],
  [1, 0, 4, 5, 4, 1, 0],
  [1, 1, 1, 1, 1, 1, 0],
  [4, 0, 0, 0, 0, 0, 4]
];

openGridFromMask(
  mask_array = mask,
  full_or_lite = "Full",
  tile_size = 28,
  tile_thickness = 6.8,
  lite_tile_thickness = 4,
  heavy_tile_thickness = 13.8,
  heavy_tile_gap = 0.2,
  add_adhesive_base = false,
  adhesive_base_thickness = 0.6,
  screw_diameter = 4.1,
  screw_head_diameter = 7.2,
  screw_head_inset = 1,
  screw_head_is_countersunk = true,
  screw_head_countersunk_degree = 90,
  backside_screw_hole = true,
  backside_screw_head_diameter_shrink = 0,
  backside_screw_head_inset = 1,
  backside_screw_head_is_countersunk = true,
  backside_screw_head_countersunk_degree = 90,
  stack_count = 1,
  stacking_method = "Interface Layer",
  interface_thickness = 0.4,
  interface_separation = 0.1,
  circle_segments = 64,
  anchor = BOT,
  spin = 0,
  orient = UP
);