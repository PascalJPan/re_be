import math

from backend.models.schemas import SquigglePoint, SquiggleFeatures


def extract_features(points: list[SquigglePoint]) -> SquiggleFeatures:
    if len(points) < 2:
        raise ValueError("Need at least 2 squiggle points")

    # Euclidean path length
    total_length = 0.0
    speeds: list[float] = []
    for i in range(1, len(points)):
        dx = points[i].x - points[i - 1].x
        dy = points[i].y - points[i - 1].y
        dist = math.sqrt(dx * dx + dy * dy)
        total_length += dist

        dt = points[i].t - points[i - 1].t
        if dt > 0:
            speeds.append(dist / dt)

    # Bounding box area
    xs = [p.x for p in points]
    ys = [p.y for p in points]
    bbox_width = max(xs) - min(xs)
    bbox_height = max(ys) - min(ys)
    bounding_box_area = bbox_width * bbox_height

    # Speed stats
    average_speed = sum(speeds) / len(speeds) if speeds else 0.0
    speed_variance = (
        sum((s - average_speed) ** 2 for s in speeds) / len(speeds)
        if speeds
        else 0.0
    )

    return SquiggleFeatures(
        total_length=round(total_length, 6),
        bounding_box_area=round(bounding_box_area, 6),
        average_speed=round(average_speed, 6),
        speed_variance=round(speed_variance, 6),
        point_count=len(points),
    )
