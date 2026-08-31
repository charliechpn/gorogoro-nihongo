from argostranslate import package


WANTED = {("en", "pt"), ("en", "ja")}


package.update_package_index()
available = package.get_available_packages()

for source, target in sorted(WANTED):
    matches = [
        candidate
        for candidate in available
        if candidate.from_code == source and candidate.to_code == target
    ]
    if not matches:
        raise RuntimeError(f"Modelo Argos ausente: {source} -> {target}")
    selected = matches[0]
    print(
        f"Baixando {source}->{target}: {selected.package_version}",
        flush=True,
    )
    download_path = selected.download()
    package.install_from_path(download_path)
    print(f"Instalado {source}->{target}", flush=True)
