/*
openGrid mask-driven generator module

Usage from a JS-generated entry SCAD:

```
use <opengrid_generator.scad>

mask = [
  [5,1,1,1,1,1,4],
  [1,0,0,0,0,0,0],
  [1,0,2,0,0,0,0],
  [1,0,0,0,0,0,0],
  [5,4,4,4,4,4,4]
];

openGridFromMask(
  mask_array = mask,
  full_or_lite = "Lite",
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
  backside_screw_hole = false,
  backside_screw_head_diameter_shrink = 0.0,
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
```

Credit to
    @David D on Printables for openGrid https://www.printables.com/@DavidD
    Katie and her community at Hands on Katie on Youtube, Patreon, and Discord https://handsonkatie.com/
    Pedro Leite for research and contributions on script performance improvements https://makerworld.com/en/@pedroleite
    mitufy for screw position options and formatting improvements
    Yukino Song for online generator https://github.com/ClassicOldSong
*/

include <BOSL2/std.scad>

function og_bit_has(v, bit) = floor(v / bit) % 2 == 1;

function og_mask_get(mask_array, x, y, d = 0) =
    (y >= 0 && y < len(mask_array) && x >= 0 && x < len(mask_array[y]))
        ? mask_array[y][x]
        : d;

function og_tile_exists(mask_array, board_w, board_h, cx, cy) =
    cx >= 0 && cx < board_w && cy >= 0 && cy < board_h && og_bit_has(og_mask_get(mask_array, cx, cy), 1);

function og_node_has_hole(mask_array, ix, iy) = og_bit_has(og_mask_get(mask_array, ix, iy), 2);
function og_node_has_chamfer(mask_array, ix, iy) = og_bit_has(og_mask_get(mask_array, ix, iy), 4);

function og_cell_center(board_w, board_h, cx, cy, tile_size) = [
    -tile_size * board_w / 2 + tile_size / 2 + cx * tile_size,
     tile_size * board_h / 2 - tile_size / 2 - cy * tile_size,
    0
];

function og_node_pos(board_w, board_h, ix, iy, tile_size) = [
    -tile_size * board_w / 2 + ix * tile_size,
     tile_size * board_h / 2 - iy * tile_size,
    0
];

function og_nw(mask_array, board_w, board_h, ix, iy) = og_tile_exists(mask_array, board_w, board_h, ix - 1, iy - 1);
function og_ne(mask_array, board_w, board_h, ix, iy) = og_tile_exists(mask_array, board_w, board_h, ix,     iy - 1);
function og_sw(mask_array, board_w, board_h, ix, iy) = og_tile_exists(mask_array, board_w, board_h, ix - 1, iy);
function og_se(mask_array, board_w, board_h, ix, iy) = og_tile_exists(mask_array, board_w, board_h, ix,     iy);

function og_node_count(mask_array, board_w, board_h, ix, iy) =
    (og_nw(mask_array, board_w, board_h, ix, iy) ? 1 : 0) +
    (og_ne(mask_array, board_w, board_h, ix, iy) ? 1 : 0) +
    (og_sw(mask_array, board_w, board_h, ix, iy) ? 1 : 0) +
    (og_se(mask_array, board_w, board_h, ix, iy) ? 1 : 0);

function og_node_kind(mask_array, board_w, board_h, ix, iy) =
    og_node_count(mask_array, board_w, board_h, ix, iy) == 4 ? "full" :
    og_node_count(mask_array, board_w, board_h, ix, iy) == 3 ? "inner" :
    og_node_count(mask_array, board_w, board_h, ix, iy) == 1 ? "outer" :
    og_node_count(mask_array, board_w, board_h, ix, iy) == 2 ? (
        (og_nw(mask_array, board_w, board_h, ix, iy) && og_ne(mask_array, board_w, board_h, ix, iy)) ||
        (og_sw(mask_array, board_w, board_h, ix, iy) && og_se(mask_array, board_w, board_h, ix, iy)) ||
        (og_nw(mask_array, board_w, board_h, ix, iy) && og_sw(mask_array, board_w, board_h, ix, iy)) ||
        (og_ne(mask_array, board_w, board_h, ix, iy) && og_se(mask_array, board_w, board_h, ix, iy))
            ? "edge"
            : "diag"
    ) : "none";

function og_node_dir(mask_array, board_w, board_h, ix, iy) =
    og_node_kind(mask_array, board_w, board_h, ix, iy) == "outer" ? (
        og_se(mask_array, board_w, board_h, ix, iy) ? "tl" :
        og_sw(mask_array, board_w, board_h, ix, iy) ? "tr" :
        og_ne(mask_array, board_w, board_h, ix, iy) ? "bl" :
        og_nw(mask_array, board_w, board_h, ix, iy) ? "br" : ""
    ) :
    og_node_kind(mask_array, board_w, board_h, ix, iy) == "edge" ? (
        og_nw(mask_array, board_w, board_h, ix, iy) && og_ne(mask_array, board_w, board_h, ix, iy) ? "up" :
        og_sw(mask_array, board_w, board_h, ix, iy) && og_se(mask_array, board_w, board_h, ix, iy) ? "down" :
        og_nw(mask_array, board_w, board_h, ix, iy) && og_sw(mask_array, board_w, board_h, ix, iy) ? "left" :
        og_ne(mask_array, board_w, board_h, ix, iy) && og_se(mask_array, board_w, board_h, ix, iy) ? "right" : ""
    ) : "";

function og_connector_rot(dir) =
    dir == "right" ? 0 :
    dir == "left"  ? 180 :
    dir == "down"  ? -90 :
    dir == "up"    ? 90 : 0;

function og_mirror_mask_y(mask_array) =
    let(
        board_h = len(mask_array) - 1,
        board_w = len(mask_array[0]) - 1
    ) [
        for (iy = [0:board_h]) [
            for (ix = [0:board_w])
                (iy < board_h && ix < board_w && og_bit_has(og_mask_get(mask_array, ix, board_h - 1 - iy), 1) ? 1 : 0) +
                (og_bit_has(og_mask_get(mask_array, ix, board_h - iy), 2) ? 2 : 0) +
                (og_bit_has(og_mask_get(mask_array, ix, board_h - iy), 4) ? 4 : 0)
        ]
    ];

module og_connector_cutout_delete_tool(circle_segments = 64, anchor = CENTER, spin = 0, orient = UP) {
    $fn = circle_segments;

    connector_cutout_radius = 2.6;
    connector_cutout_dimple_radius = 2.7;
    connector_cutout_separation = 2.5;
    connector_cutout_height = 2.4;

    attachable(anchor, spin, orient, size=[connector_cutout_radius * 2 - 0.1, connector_cutout_radius * 2, connector_cutout_height]) {
        tag_scope()
            translate([-connector_cutout_radius + 0.05, 0, -connector_cutout_height / 2])
                render()
                    half_of(RIGHT, s=connector_cutout_dimple_radius * 4)
                        linear_extrude(height=connector_cutout_height)
                            union() {
                                left(0.1)
                                    diff() {
                                        hull()
                                            xcopies(spacing=connector_cutout_radius * 2)
                                                circle(r=connector_cutout_radius);

                                        tag("remove")
                                            right(connector_cutout_radius - connector_cutout_separation)
                                                ycopies(spacing=(connector_cutout_radius + connector_cutout_separation) * 2)
                                                    circle(r=connector_cutout_dimple_radius);
                                    }

                                rect(
                                    [1, connector_cutout_separation * 2 - (connector_cutout_dimple_radius - connector_cutout_separation)],
                                    rounding=[0, -.25, -.25, 0],
                                    $fn=32,
                                    corner_flip=true,
                                    anchor=LEFT
                                );
                            }
        children();
    }
}

module og_openGridTileAp1(tile_size = 28, tile_thickness = 6.8, board_type = "Full", circle_segments = 64) {
    $fn = circle_segments;

    Outside_Extrusion = 0.8;
    Inside_Grid_Top_Chamfer = 0.4;
    Inside_Grid_Middle_Chamfer = 1;
    Top_Capture_Initial_Inset = 2.4;
    Corner_Square_Thickness = 2.6;
    Intersection_Distance = 4.2;
    Tile_Inner_Size_Difference = 3;

    Tile_Inner_Size = tile_size - Tile_Inner_Size_Difference;
    insideExtrusion = (tile_size - Tile_Inner_Size) / 2 - Outside_Extrusion;
    cornerChamfer = Top_Capture_Initial_Inset - Inside_Grid_Middle_Chamfer;

    CalculatedCornerChamfer = sqrt(Intersection_Distance ^ 2 / 2);
    cornerOffset = CalculatedCornerChamfer + Corner_Square_Thickness;

    full_tile_profile = board_type == "Heavy" ? [
        [0, 0],
        [Outside_Extrusion, 0],
        [Outside_Extrusion, tile_thickness - Top_Capture_Initial_Inset],
        [Outside_Extrusion + insideExtrusion, tile_thickness - Top_Capture_Initial_Inset + Inside_Grid_Middle_Chamfer],
        [Outside_Extrusion + insideExtrusion, tile_thickness - Inside_Grid_Top_Chamfer],
        [Outside_Extrusion + insideExtrusion - Inside_Grid_Top_Chamfer, tile_thickness],
        [0, tile_thickness],
    ] : [
        [0, 0],
        [Outside_Extrusion + insideExtrusion - Inside_Grid_Top_Chamfer, 0],
        [Outside_Extrusion + insideExtrusion, Inside_Grid_Top_Chamfer],
        [Outside_Extrusion + insideExtrusion, Top_Capture_Initial_Inset - Inside_Grid_Middle_Chamfer],
        [Outside_Extrusion, Top_Capture_Initial_Inset],
        [Outside_Extrusion, tile_thickness - Top_Capture_Initial_Inset],
        [Outside_Extrusion + insideExtrusion, tile_thickness - Top_Capture_Initial_Inset + Inside_Grid_Middle_Chamfer],
        [Outside_Extrusion + insideExtrusion, tile_thickness - Inside_Grid_Top_Chamfer],
        [Outside_Extrusion + insideExtrusion - Inside_Grid_Top_Chamfer, tile_thickness],
        [0, tile_thickness],
    ];

    full_tile_corners_profile = [
        [0, 0],
        [cornerOffset - cornerChamfer, 0],
        [cornerOffset, cornerChamfer],
        [cornerOffset, tile_thickness - cornerChamfer],
        [cornerOffset - cornerChamfer, tile_thickness],
        [0, tile_thickness],
    ];

    path_tile = [[tile_size / 2, -tile_size / 2], [-tile_size / 2, -tile_size / 2]];

    intersection() {
        union() {
            zrot_copies(n=4)
                union() {
                    path_extrude2d(path_tile)
                        polygon(full_tile_profile);

                    move([-tile_size / 2, -tile_size / 2])
                        rotate([0, 0, 45])
                            back(cornerOffset)
                                rotate([90, 0, 0])
                                    linear_extrude(cornerOffset * 2)
                                        polygon(full_tile_corners_profile);
                }
        }
        cube([tile_size, tile_size, tile_thickness], anchor=BOT);
    }
}

module openGridFromMask(
    mask_array,
    full_or_lite = "Lite",
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
    backside_screw_hole = false,
    backside_screw_head_diameter_shrink = 0.0,
    backside_screw_head_inset = 1,
    backside_screw_head_is_countersunk = true,
    backside_screw_head_countersunk_degree = 90,
    stack_count = 1,
    stacking_method = "Interface Layer",
    interface_thickness = 0.4,
    interface_separation = 0.1,
    circle_segments = 64,
    anchor = CENTER,
    spin = 0,
    orient = UP
) {
    board_h = len(mask_array) - 1;
    board_w = len(mask_array[0]) - 1;
    stack_mask_array =
        full_or_lite == "Lite" || (full_or_lite == "Full" && !backside_screw_hole)
            ? og_mirror_mask_y(mask_array)
            : mask_array;

    adjusted_stack_count = add_adhesive_base ? 1 : stack_count;
    adjusted_interface_thickness = stacking_method == "Interface Layer" ? interface_thickness : 0;

    module node_base_fill(kind, tile_size, tile_thickness_local) {
        Corner_Square_Thickness = 2.6;
        Intersection_Distance = 4.2;
        node_fill_w = sqrt(Corner_Square_Thickness * Corner_Square_Thickness * 2) + Intersection_Distance;

        if (kind == "full" || kind == "inner" || kind == "diag")
            zrot(45)
                cuboid([node_fill_w, node_fill_w, tile_thickness_local], anchor=BOT);
    }

    module screw_hole_cut(tile_thickness_local, board_type) {
        $fn = circle_segments;

        front_head_d = screw_head_diameter;
        back_head_d = max(screw_diameter, screw_head_diameter - backside_screw_head_diameter_shrink);

        front_cs_h =
            screw_head_is_countersunk
                ? tan((180 - screw_head_countersunk_degree) / 2) * (front_head_d / 2 - screw_diameter / 2) - 0.01
                : 0.01;

        back_cs_h =
            backside_screw_head_is_countersunk
                ? tan((180 - backside_screw_head_countersunk_degree) / 2) * (back_head_d / 2 - screw_diameter / 2) - 0.01
                : 0.01;

        enable_backside_screw_hole = backside_screw_hole && board_type != "Heavy";

        union() {
            through_h = tile_thickness_local + 0.02;
            front_head_h = screw_head_inset > 0 ? screw_head_inset : 0.01;
            back_head_h = backside_screw_head_inset > 0 ? backside_screw_head_inset : 0.01;
            front_head_z = tile_thickness_local - front_head_h;
            front_cone_z = front_head_z - front_cs_h;
            back_head_z = -0.01;
            back_cone_z = back_head_z + back_head_h;

            // Keep the browser and native exports aligned by using basic
            // OpenSCAD cylinder primitives instead of BOSL2 attach chains.
            down(0.01)
                cylinder(d=screw_diameter, h=through_h);

            if (front_cs_h > 0)
                up(front_cone_z)
                    cylinder(d1=screw_diameter, d2=front_head_d, h=front_cs_h);

            up(front_head_z)
                cylinder(d=front_head_d, h=front_head_h + 0.01);

            if (enable_backside_screw_hole)
                union() {
                    up(back_head_z)
                        cylinder(d=back_head_d, h=back_head_h + 0.01);

                    if (back_cs_h > 0)
                        up(back_cone_z)
                            cylinder(d1=back_head_d, d2=screw_diameter, h=back_cs_h);
                }
        }
    }

    module applyMaskFeatures(mask_array_local = mask_array, tile_thickness_local = 6.8, board_type = "Full", skip_connectors = false) {
        $fn = circle_segments;

        Intersection_Distance = 4.2;
        tileChamfer = sqrt(Intersection_Distance ^ 2 * 2);
        lite_cutout_distance_from_top = 1;
        connector_cutout_height = 2.4 + 0.01;

        for (iy = [0:board_h])
            for (ix = [0:board_w]) {
                kind = og_node_kind(mask_array_local, board_w, board_h, ix, iy);
                dir = og_node_dir(mask_array_local, board_w, board_h, ix, iy);
                p = og_node_pos(board_w, board_h, ix, iy, tile_size);

                if (kind != "none" && kind != "used") {
                    if (og_node_has_chamfer(mask_array_local, ix, iy))
                        tag("remove")
                            translate(p)
                                down(0.01)
                                    zrot(45)
                                        cuboid([tileChamfer, tileChamfer, tile_thickness_local + 0.02], anchor=BOT);

                    if (og_node_has_hole(mask_array_local, ix, iy)) {
                        if (kind == "full" || kind == "inner" || kind == "diag")
                            tag("remove")
                                translate(p)
                                    screw_hole_cut(tile_thickness_local, board_type);

                        if (kind == "edge" && !skip_connectors)
                            tag("remove")
                                translate(p)
                                    up(board_type == "Lite"
                                        ? tile_thickness_local - connector_cutout_height / 2 - lite_cutout_distance_from_top
                                        : tile_thickness_local / 2)
                                        zrot(og_connector_rot(dir))
                                            og_connector_cutout_delete_tool(circle_segments=circle_segments, anchor=LEFT);
                    }
                }
            }
    }

    module openGridMasked(mask_array_local = mask_array, board_type = "Full", base_thickness = 6.8, anchor_local = CENTER, spin_local = 0, orient_local = UP, skip_connectors = false) {
        attachable(anchor_local, spin_local, orient_local, size=[board_w * tile_size, board_h * tile_size, base_thickness]) {
            down(base_thickness / 2)
                render(convexity=3)
                    diff() {
                        render()
                            union() {
                                for (cy = [0:board_h - 1])
                                    for (cx = [0:board_w - 1])
                                        if (og_tile_exists(mask_array_local, board_w, board_h, cx, cy))
                                            translate(og_cell_center(board_w, board_h, cx, cy, tile_size))
                                                og_openGridTileAp1(tile_size=tile_size, tile_thickness=base_thickness, board_type=board_type, circle_segments=circle_segments);

                                for (iy = [0:board_h])
                                    for (ix = [0:board_w]) {
                                        kind = og_node_kind(mask_array_local, board_w, board_h, ix, iy);
                                        if (kind == "full" || kind == "inner" || kind == "diag")
                                            translate(og_node_pos(board_w, board_h, ix, iy, tile_size))
                                                node_base_fill(kind, tile_size, base_thickness);
                                    }
                            }

                        applyMaskFeatures(mask_array_local=mask_array_local, tile_thickness_local=base_thickness, board_type=board_type, skip_connectors=skip_connectors);
                    }
            children();
        }
    }

    module adhesiveBaseMasked(mask_array_local = mask_array, anchor_local = CENTER, spin_local = 0, orient_local = UP) {
        attachable(anchor_local, spin_local, orient_local, size=[tile_size * board_w, tile_size * board_h, adhesive_base_thickness]) {
            render(convexity=2)
                diff() {
                    cube([tile_size * board_w, tile_size * board_h, adhesive_base_thickness], anchor=BOT, orient=DOWN);
                    down(adhesive_base_thickness)
                        applyMaskFeatures(mask_array_local=mask_array_local, tile_thickness_local=adhesive_base_thickness, board_type="Lite");
                }
            children();
        }
    }

    module openGridLiteMasked(mask_array_local = mask_array, anchor_local = CENTER, spin_local = 0, orient_local = UP, flip = false) {
        total_thickness = lite_tile_thickness + (add_adhesive_base ? adhesive_base_thickness : 0);

        attachable(anchor_local, spin_local, orient_local, size=[board_w * tile_size, board_h * tile_size, total_thickness]) {
            render(convexity=2)
                union() {
                    if (flip)
                        mirror([0, 0, 1])
                            down(tile_thickness - lite_tile_thickness)
                                top_half(z=tile_thickness - lite_tile_thickness, s=max(tile_size * board_w, tile_size * board_h) * 2)
                                    openGridMasked(mask_array_local=mask_array_local, board_type="Lite", base_thickness=tile_thickness, anchor_local=BOT);
                    else
                        down(tile_thickness - lite_tile_thickness)
                            top_half(z=tile_thickness - lite_tile_thickness, s=max(tile_size * board_w, tile_size * board_h) * 2)
                                openGridMasked(mask_array_local=mask_array_local, board_type="Lite", base_thickness=tile_thickness, anchor_local=BOT);

                    if (add_adhesive_base)
                        adhesiveBaseMasked(mask_array_local=mask_array_local);
                }
            children();
        }
    }

    module openGridHeavyMasked(mask_array_local = mask_array, anchor_local = CENTER, spin_local = 0, orient_local = UP) {
        attachable(anchor_local, spin_local, orient_local, size=[board_w * tile_size, board_h * tile_size, heavy_tile_thickness]) {
            render(convexity=4)
                union() {
                    up(heavy_tile_gap / 2)
                        openGridMasked(mask_array_local=mask_array_local, board_type="Heavy", base_thickness=tile_thickness, anchor_local=BOT);
                    down(heavy_tile_gap / 2)
                        linear_extrude(heavy_tile_gap)
                            projection(cut=true)
                                openGridMasked(mask_array_local=mask_array_local, board_type="Heavy", base_thickness=tile_thickness, anchor_local=BOT, skip_connectors=true);
                    down(heavy_tile_gap / 2)
                        mirror([0, 0, 1])
                            openGridMasked(mask_array_local=mask_array_local, board_type="Heavy", base_thickness=tile_thickness, anchor_local=BOT);
                }
            children();
        }
    }

    module interfaceLayerMasked(mask_array_local = mask_array, board_type = "Full", anchor_local = CENTER, spin_local = 0, orient_local = UP) {
        linear_extrude(height=interface_thickness)
            projection(cut=true)
                if (board_type == "Heavy")
                    down(heavy_tile_thickness - 0.01)
                        openGridHeavyMasked(mask_array_local=mask_array_local, anchor_local=BOT);
                else
                    openGridMasked(mask_array_local=mask_array_local, board_type=board_type, base_thickness=tile_thickness, anchor_local=BOT);
    }

    module interfaceLayerLiteMasked(mask_array_local = mask_array) {
        linear_extrude(height=interface_thickness)
            projection(cut=true)
                down(lite_tile_thickness / 2 + 0.01)
                    openGridLiteMasked(mask_array_local=mask_array_local, anchor_local=BOT);
    }

    if (full_or_lite == "Full" && adjusted_stack_count == 1)
        openGridMasked(board_type="Full", base_thickness=tile_thickness, anchor_local=anchor, spin_local=spin, orient_local=orient);

    if (full_or_lite == "Lite" && adjusted_stack_count == 1)
        openGridLiteMasked(anchor_local=anchor, spin_local=spin, orient_local=orient);

    if (full_or_lite == "Heavy" && adjusted_stack_count == 1)
        openGridHeavyMasked(anchor_local=anchor, spin_local=spin, orient_local=orient);

    if (full_or_lite == "Full" && adjusted_stack_count > 1) {
        zcopies(spacing=tile_thickness + adjusted_interface_thickness + 2 * interface_separation, n=adjusted_stack_count, sp=[0, 0, tile_thickness])
            zflip()
                openGridMasked(mask_array_local=stack_mask_array, board_type="Full", base_thickness=tile_thickness, anchor_local=BOT);

        if (stacking_method == "Interface Layer")
            zcopies(spacing=tile_thickness + adjusted_interface_thickness + 2 * interface_separation, n=adjusted_stack_count - 1, sp=[0, 0, tile_thickness + interface_separation])
                color("red")
                    interfaceLayerMasked(mask_array_local=stack_mask_array, board_type="Full", anchor_local=BOT);
    }

    if (full_or_lite == "Lite" && adjusted_stack_count > 1) {
        zcopies(spacing=lite_tile_thickness + adjusted_interface_thickness + 2 * interface_separation, n=adjusted_stack_count, sp=[0, 0, lite_tile_thickness + lite_tile_thickness / 2])
            zflip()
                openGridLiteMasked(mask_array_local=stack_mask_array, anchor_local=BOT);

        if (stacking_method == "Interface Layer")
            zcopies(spacing=lite_tile_thickness + adjusted_interface_thickness + 2 * interface_separation, n=adjusted_stack_count - 1, sp=[0, 0, lite_tile_thickness + interface_separation])
                color("red")
                    interfaceLayerLiteMasked(mask_array_local=stack_mask_array);
    }

    if (full_or_lite == "Heavy" && adjusted_stack_count > 1) {
        zcopies(spacing=heavy_tile_thickness + adjusted_interface_thickness + 2 * interface_separation, n=adjusted_stack_count, sp=[0, 0, 0])
            openGridHeavyMasked(anchor_local=BOT);

        if (stacking_method == "Interface Layer")
            zcopies(spacing=heavy_tile_thickness + adjusted_interface_thickness + 2 * interface_separation, n=adjusted_stack_count - 1, sp=[0, 0, heavy_tile_thickness + interface_separation])
                color("red")
                    interfaceLayerMasked(board_type="Heavy", anchor_local=BOT);
    }
}
