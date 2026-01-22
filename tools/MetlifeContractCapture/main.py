"""
MetLife 계약사항 캡처 도구 CLI
자동 화면 캡처 및 데이터 추출
"""
import os
import sys
import time
from pathlib import Path
from datetime import datetime
from typing import List, Optional

import click
from rich.console import Console
from rich.progress import Progress, SpinnerColumn, TextColumn, BarColumn
from rich.table import Table

# 모듈 경로 추가
sys.path.insert(0, str(Path(__file__).parent))

from capture.screen_capturer import ScreenCapturer, CaptureRegion
from capture.scroll_controller import ScrollController, ScrollConfig
from capture.duplicate_detector import DuplicateDetector
from extract.upstage_ocr import UpstageOCRExtractor
from extract.upstage_ie import UpstageIEExtractor
from extract.claude_vision import ClaudeVisionExtractor
from extract.clova_ocr import ClovaOCRExtractor
from extract.table_parser import TableParser
from output.json_exporter import JsonExporter
from output.excel_exporter import ExcelExporter
from models.contract import ContractRow

console = Console()


def load_config(config_path: str) -> dict:
    """설정 파일 로드"""
    import yaml

    if not Path(config_path).exists():
        return {}

    with open(config_path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


@click.group()
@click.version_option(version="1.0.0")
def cli():
    """MetLife 계약사항 자동 캡처 및 데이터 추출 도구"""
    pass


@cli.command()
def monitors():
    """사용 가능한 모니터 목록 표시"""
    ScreenCapturer.list_monitors()


@cli.command()
def position():
    """현재 마우스 위치 표시 (Ctrl+C로 종료)"""
    console.print("[cyan]마우스 위치 추적 중... (Ctrl+C로 종료)[/cyan]")
    console.print("캡처 영역과 스크롤 위치 설정에 활용하세요.\n")

    scroller = ScrollController(ScrollConfig())

    try:
        while True:
            x, y = scroller.get_mouse_position()
            console.print(f"\r위치: X={x}, Y={y}    ", end="")
            time.sleep(0.1)
    except KeyboardInterrupt:
        console.print("\n\n[yellow]종료됨[/yellow]")


@cli.command()
@click.option("--output", "-o", default="D:\\captures", help="캡처 저장 폴더")
@click.option("--monitor", "-m", default=0, type=int, help="모니터 인덱스 (0=전체)")
@click.option("--delay", "-d", default=5, type=int, help="시작 전 대기 시간(초)")
@click.option("--max-pages", default=100, type=int, help="최대 캡처 페이지 수")
@click.option("--region", "-r", default=None, help="캡처 영역 (left,top,width,height)")
@click.option("--scroll-pos", "-s", default=None, help="스크롤 위치 (x,y)")
@click.option("--scroll-amount", default=-30, type=int, help="스크롤 양 (음수=아래, 기본=-30)")
def capture(output, monitor, delay, max_pages, region, scroll_pos, scroll_amount):
    """1단계: 화면 캡처"""

    # 캡처 영역 파싱
    if region:
        parts = [int(x) for x in region.split(",")]
        capture_region = CaptureRegion(parts[0], parts[1], parts[2], parts[3])
    else:
        # 기본 영역 (MetLife 계약사항 조회 테이블, 1920x1080 기준)
        # height=560은 11개 행 캡처에 적합 (행당 약 26px + 헤더)
        capture_region = CaptureRegion(left=18, top=295, width=1890, height=560)
        console.print(f"[yellow]기본 캡처 영역 사용: {capture_region}[/yellow]")
        console.print("[dim]--region 옵션으로 조정 가능[/dim]\n")

    # 스크롤 위치 파싱
    if scroll_pos:
        parts = [int(x) for x in scroll_pos.split(",")]
        scroll_position = (parts[0], parts[1])
    else:
        # 기본 스크롤 위치 (테이블 중앙)
        scroll_position = (900, 450)
        console.print(f"[yellow]기본 스크롤 위치 사용: {scroll_position}[/yellow]")
        console.print("[dim]--scroll-pos 옵션으로 조정 가능[/dim]\n")

    # 모듈 초기화
    capturer = ScreenCapturer(output, monitor=monitor, beep_on_capture=True)
    scroller = ScrollController(ScrollConfig(
        scroll_amount=scroll_amount,
        scroll_delay=1.5,  # 스크롤 후 대기 시간 (안정적 동작)
        scroll_position=scroll_position,
        use_pagedown=False,  # 마우스 휠 스크롤 사용
    ))
    detector = DuplicateDetector(threshold=5)

    captured_files = []
    previous_file = None

    console.print(f"[bold green]캡처 시작[/bold green]")
    console.print(f"저장 경로: {output}")
    console.print(f"모니터: {monitor}")
    console.print(f"캡처 영역: {capture_region}")
    console.print(f"스크롤 위치: {scroll_position}")

    # 초기 대기
    console.print(f"\n[cyan]{delay}초 후 캡처 시작...[/cyan]")
    console.print("[dim]이 시간 동안 MetLife 화면을 준비하세요.[/dim]")
    for i in range(delay, 0, -1):
        console.print(f"\r{i}초...", end="")
        time.sleep(1)
    console.print("\r시작!   \n")

    # 맨 위로 스크롤
    console.print("[dim]맨 위로 스크롤...[/dim]")
    scroller.scroll_to_top()
    time.sleep(1)

    # 캡처 루프
    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        BarColumn(),
        TextColumn("[progress.percentage]{task.completed}/{task.total}"),
        console=console,
    ) as progress:
        task = progress.add_task("캡처 중...", total=max_pages)

        while len(captured_files) < max_pages:
            # 캡처
            file_path = capturer.capture_region(capture_region)
            progress.update(task, advance=1)

            if not file_path:
                console.print("[red]캡처 실패[/red]")
                break

            # 스크롤 끝 감지
            if detector.is_scroll_end(file_path, previous_file):
                console.print(f"\n[yellow]스크롤 끝 감지 - 캡처 완료[/yellow]")
                os.remove(file_path)
                break

            captured_files.append(file_path)
            console.print(f"[green]캡처: {file_path}[/green]")
            previous_file = file_path

            # 스크롤
            scroller.scroll_down()

    console.print(f"\n[bold green]총 {len(captured_files)}장 캡처 완료[/bold green]")

    # 결과 요약
    table = Table(title="캡처 결과")
    table.add_column("항목", style="cyan")
    table.add_column("값")
    table.add_row("캡처 수", str(len(captured_files)))
    table.add_row("저장 경로", output)
    console.print(table)


@cli.command()
@click.option("--input", "-i", "input_path", default="D:\\captures", help="캡처 이미지 폴더")
@click.option("--output", "-o", default=None, help="결과 저장 폴더 (기본: 캡처폴더/output)")
@click.option("--format", "-f", "output_format",
              type=click.Choice(["json", "excel", "both"]), default="both",
              help="출력 형식")
@click.option("--engine", "-e",
              type=click.Choice(["clova", "claude", "upstage", "upstage-ie"]), default="clova",
              help="추출 엔진 (기본: clova, upstage-ie: 스키마 기반 $0.04/page)")
@click.option("--model", "-m",
              type=click.Choice(["opus", "sonnet"]), default="opus",
              help="Claude 모델 (기본: opus, 정확도↑ 비용↑)")
@click.option("--debug", is_flag=True, help="디버그 모드 (API 응답을 파일로 저장)")
def extract(input_path, output, output_format, engine, model, debug):
    """2단계: 데이터 추출"""

    input_dir = Path(input_path)

    # output이 지정되지 않으면 캡처폴더/output 사용
    if output is None:
        output_dir = input_dir / "output"
    else:
        output_dir = Path(output)
    output_dir.mkdir(parents=True, exist_ok=True)

    # 이미지 파일 수집
    images = sorted(input_dir.glob("*.png"))
    if not images:
        console.print("[red]캡처 이미지가 없습니다.[/red]")
        return

    console.print(f"[cyan]추출 대상: {len(images)}장[/cyan]")
    console.print(f"[cyan]추출 엔진: {engine}[/cyan]")
    if engine == "claude":
        console.print(f"[cyan]Claude 모델: {model}[/cyan]")
    console.print(f"[cyan]결과 저장: {output_dir}[/cyan]")

    # 추출기 선택
    if engine == "clova":
        try:
            extractor = ClovaOCRExtractor()
        except ValueError as e:
            console.print(f"[red]{e}[/red]")
            console.print("[dim]CLOVA_OCR_API_URL, CLOVA_OCR_SECRET_KEY 환경변수를 설정하세요.[/dim]")
            return
    elif engine == "upstage":
        try:
            extractor = UpstageOCRExtractor(debug=debug)
        except ValueError as e:
            console.print(f"[red]{e}[/red]")
            console.print("[dim]UPSTAGE_API_KEY 환경변수를 설정하세요.[/dim]")
            return
    elif engine == "upstage-ie":
        try:
            extractor = UpstageIEExtractor(debug=debug)
        except ValueError as e:
            console.print(f"[red]{e}[/red]")
            console.print("[dim]UPSTAGE_API_KEY 환경변수를 설정하세요.[/dim]")
            return
    else:  # claude
        try:
            model_id = f"claude-{model}-4-20250514"
            extractor = ClaudeVisionExtractor(model=model_id)
        except ValueError as e:
            console.print(f"[red]{e}[/red]")
            console.print("[dim]ANTHROPIC_API_KEY 환경변수를 설정하세요.[/dim]")
            return

    # 추출 실행
    results = []
    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        BarColumn(),
        TextColumn("[progress.percentage]{task.completed}/{task.total}"),
        console=console,
    ) as progress:
        task = progress.add_task("추출 중...", total=len(images))

        def on_progress(current, total):
            progress.update(task, completed=current)

        results = extractor.extract_from_images(
            [str(img) for img in images],
            progress_callback=on_progress
        )

    # 파싱 및 병합
    parser = TableParser()
    rows = parser.merge_results(results)

    console.print(f"\n[green]추출된 계약: {len(rows)}건[/green]")

    if not rows:
        console.print("[yellow]추출된 데이터가 없습니다.[/yellow]")
        return

    # 통계
    stats = parser.get_statistics(rows)

    # 내보내기
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

    if output_format in ("json", "both"):
        json_file = JsonExporter.export(
            rows,
            output_dir / f"contracts_{timestamp}.json",
            metadata={"engine": engine, **stats}
        )
        console.print(f"[green]JSON 저장: {json_file}[/green]")

    if output_format in ("excel", "both"):
        excel_file = ExcelExporter.export_with_statistics(
            rows,
            output_dir / f"contracts_{timestamp}.xlsx",
            statistics=stats
        )
        console.print(f"[green]Excel 저장: {excel_file}[/green]")

    # 결과 요약
    table = Table(title="추출 결과")
    table.add_column("항목", style="cyan")
    table.add_column("값")
    table.add_row("총 계약 수", str(stats["total_count"]))
    table.add_row("총 월납입보험료", f"{stats['total_premium']:,}원")
    table.add_row("평균 월납입보험료", f"{stats['avg_premium']:,}원")
    console.print(table)


@cli.command()
@click.option("--output", "-o", default="D:\\captures", help="캡처 및 결과 저장 폴더")
@click.option("--delay", "-d", default=5, type=int, help="시작 전 대기 시간(초)")
@click.option("--engine", "-e",
              type=click.Choice(["clova", "claude", "upstage", "upstage-ie"]), default="clova",
              help="추출 엔진 (기본: clova, upstage-ie: 스키마 기반 $0.04/page)")
@click.option("--region", "-r", default=None, help="캡처 영역 (left,top,width,height)")
@click.option("--scroll-pos", "-s", default=None, help="스크롤 위치 (x,y)")
@click.pass_context
def run(ctx, output, delay, engine, region, scroll_pos):
    """전체 워크플로우 실행 (캡처 + 추출)"""

    captures_dir = Path(output)

    # 1단계: 캡처
    console.print("[bold]===== 1단계: 캡처 =====[/bold]\n")
    ctx.invoke(
        capture,
        output=str(captures_dir),
        delay=delay,
        region=region,
        scroll_pos=scroll_pos
    )

    # 2단계: 추출 (output은 None으로 → captures_dir/output 자동 사용)
    console.print("\n[bold]===== 2단계: 추출 =====[/bold]\n")
    ctx.invoke(
        extract,
        input_path=str(captures_dir),
        output=None,  # 캡처폴더/output 자동 사용
        engine=engine
    )

    console.print("\n[bold green]===== 완료 =====[/bold green]")


@cli.command()
@click.option("--output", "-o", default="test_capture.png", help="저장 파일명")
@click.option("--monitor", "-m", default=0, type=int, help="모니터 인덱스")
@click.option("--delay", "-d", default=3, type=int, help="대기 시간(초)")
def test_capture(output, monitor, delay):
    """전체 화면 테스트 캡처 (영역 확인용)"""

    capturer = ScreenCapturer(
        save_path=str(Path(output).parent) if "/" in output or "\\" in output else ".",
        monitor=monitor
    )

    console.print(f"[cyan]{delay}초 후 전체 화면 캡처...[/cyan]")
    for i in range(delay, 0, -1):
        console.print(f"\r{i}초...", end="")
        time.sleep(1)

    file_path = capturer.capture_full_monitor(filename_prefix=Path(output).stem)
    console.print(f"\n[green]캡처 완료: {file_path}[/green]")
    console.print("[dim]이 이미지를 참고하여 --region 값을 설정하세요.[/dim]")


if __name__ == "__main__":
    cli()
