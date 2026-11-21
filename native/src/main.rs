mod library;

use std::{env, io, path::PathBuf, process::ExitCode};

fn run() -> Result<(), String> {
    let args: Vec<_> = env::args_os().skip(1).collect();
    match args.as_slice() {
        [command, index] if command == "load" => {
            let library = library::load(&PathBuf::from(index))?;
            serde_json::to_writer(io::stdout().lock(), &library)
        }
        [command, index, folder, cache] if command == "import" => {
            let index = PathBuf::from(index);
            let result = library::import(
                &PathBuf::from(folder),
                library::load(&index)?,
                &PathBuf::from(cache),
            )?;
            library::save(&index, &result.library)?;
            serde_json::to_writer(io::stdout().lock(), &result)
        }
        _ => return Err("无效的音乐库命令。".into()),
    }
    .map_err(|error| error.to_string())
}

fn main() -> ExitCode {
    match run() {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("{error}");
            ExitCode::FAILURE
        }
    }
}
