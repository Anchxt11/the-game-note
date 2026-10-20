//! Fractional indexing implementation based on David Greenspan's algorithm.
//! Generates lexicographically sortable string keys for ordering items without
//! needing full list re-indexing. Fully compatible with the `fractional-indexing` npm package.

pub const BASE_62_DIGITS: &str = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
pub const BASE_52_DIGITS: &str = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

fn get_digit_index(digits: &[u8], byte: u8) -> Result<usize, String> {
    digits
        .iter()
        .position(|&b| b == byte)
        .ok_or_else(|| format!("Byte '{}' not found in alphabet", byte as char))
}

fn midpoint(a: &str, b: Option<&str>, digits: &[u8]) -> Result<String, String> {
    let zero = digits[0] as char;
    if let Some(b_str) = b {
        if a >= b_str {
            return Err(format!("{} >= {}", a, b_str));
        }
        if b_str.ends_with(zero) {
            return Err("trailing zero in upper bound".to_string());
        }
    }
    if a.ends_with(zero) {
        return Err("trailing zero in lower bound".to_string());
    }

    if let Some(b_str) = b {
        let a_bytes = a.as_bytes();
        let b_bytes = b_str.as_bytes();
        let mut n = 0;
        while n < b_bytes.len() {
            let a_b = if n < a_bytes.len() { a_bytes[n] } else { digits[0] };
            if a_b == b_bytes[n] {
                n += 1;
            } else {
                break;
            }
        }
        if n > 0 {
            let a_rem = if n < a.len() { &a[n..] } else { "" };
            let b_rem = &b_str[n..];
            let sub = midpoint(a_rem, Some(b_rem), digits)?;
            return Ok(format!("{}{}", &b_str[..n], sub));
        }
    }

    let digit_a = if a.is_empty() {
        0
    } else {
        get_digit_index(digits, a.as_bytes()[0])?
    };
    let digit_b = match b {
        Some(b_str) => get_digit_index(digits, b_str.as_bytes()[0])?,
        None => digits.len(),
    };

    if digit_b - digit_a > 1 {
        let mid_digit = ((digit_a + digit_b) as f64 * 0.5).round() as usize;
        Ok((digits[mid_digit] as char).to_string())
    } else if let Some(b_str) = b {
        if b_str.len() > 1 {
            Ok(b_str[..1].to_string())
        } else {
            let mut res = String::new();
            res.push(digits[digit_a] as char);
            let a_sub = if a.is_empty() { "" } else { &a[1..] };
            res.push_str(&midpoint(a_sub, None, digits)?);
            Ok(res)
        }
    } else {
        let mut res = String::new();
        res.push(digits[digit_a] as char);
        let a_sub = if a.is_empty() { "" } else { &a[1..] };
        res.push_str(&midpoint(a_sub, None, digits)?);
        Ok(res)
    }
}

fn get_integer_length(head: char, int_digits: &[u8]) -> Result<usize, String> {
    let i = get_digit_index(int_digits, head as u8)?;
    let half = int_digits.len() / 2;
    if i < half {
        Ok(half - i + 1)
    } else {
        Ok(i - half + 2)
    }
}

fn get_integer_part<'a>(key: &'a str, int_digits: &[u8]) -> Result<&'a str, String> {
    let head = key
        .chars()
        .next()
        .ok_or_else(|| "Empty key has no integer part".to_string())?;
    let len = get_integer_length(head, int_digits)?;
    if len > key.len() {
        return Err(format!("Invalid order key: {}", key));
    }
    Ok(&key[..len])
}

fn is_smallest_integer(key: &str, digits: &[u8], int_digits: &[u8]) -> bool {
    let expected_len = 1 + int_digits.len() / 2;
    if key.len() != expected_len {
        return false;
    }
    let bytes = key.as_bytes();
    if bytes[0] != int_digits[0] {
        return false;
    }
    bytes[1..].iter().all(|&b| b == digits[0])
}

fn validate_order_key(key: &str, digits: &[u8], int_digits: &[u8]) -> Result<(), String> {
    if is_smallest_integer(key, digits, int_digits) {
        return Err(format!("Invalid order key (smallest integer): {}", key));
    }
    let ip = get_integer_part(key, int_digits)?;
    let fp = &key[ip.len()..];
    if fp.ends_with(digits[0] as char) {
        return Err(format!("Invalid order key (trailing zero): {}", key));
    }
    Ok(())
}

fn increment_integer(x: &str, digits: &[u8], int_digits: &[u8]) -> Result<Option<String>, String> {
    let head = x
        .chars()
        .next()
        .ok_or_else(|| "Empty integer part".to_string())?;
    let zero = digits[0] as char;
    let mut trailing = String::new();

    let x_bytes = x.as_bytes();
    for i in (1..x.len()).rev() {
        let d = get_digit_index(digits, x_bytes[i])? + 1;
        if d == digits.len() {
            trailing.insert(0, zero);
        } else {
            let mut res = String::new();
            res.push(head);
            res.push_str(&x[1..i]);
            res.push(digits[d] as char);
            res.push_str(&trailing);
            return Ok(Some(res));
        }
    }

    let head_idx = get_digit_index(int_digits, head as u8)?;
    if head_idx == int_digits.len() - 1 {
        return Ok(None);
    }
    let h = int_digits[head_idx + 1] as char;
    let len_delta = get_integer_length(h, int_digits)? as isize - get_integer_length(head, int_digits)? as isize;

    let mut res = String::new();
    res.push(h);
    if len_delta > 0 {
        res.push_str(&trailing);
        res.push(zero);
    } else if len_delta < 0 {
        if trailing.len() > 1 {
            res.push_str(&trailing[1..]);
        }
    } else {
        res.push_str(&trailing);
    }
    Ok(Some(res))
}

fn decrement_integer(x: &str, digits: &[u8], int_digits: &[u8]) -> Result<Option<String>, String> {
    let head = x
        .chars()
        .next()
        .ok_or_else(|| "Empty integer part".to_string())?;
    let last = *digits.last().unwrap() as char;
    let mut trailing = String::new();

    let x_bytes = x.as_bytes();
    for i in (1..x.len()).rev() {
        let d = get_digit_index(digits, x_bytes[i])? as isize - 1;
        if d == -1 {
            trailing.insert(0, last);
        } else {
            let mut res = String::new();
            res.push(head);
            res.push_str(&x[1..i]);
            res.push(digits[d as usize] as char);
            res.push_str(&trailing);
            return Ok(Some(res));
        }
    }

    let head_idx = get_digit_index(int_digits, head as u8)?;
    if head_idx == 0 {
        return Ok(None);
    }
    let h = int_digits[head_idx - 1] as char;
    let len_delta = get_integer_length(h, int_digits)? as isize - get_integer_length(head, int_digits)? as isize;

    let mut res = String::new();
    res.push(h);
    if len_delta > 0 {
        res.push_str(&trailing);
        res.push(last);
    } else if len_delta < 0 {
        if trailing.len() > 1 {
            res.push_str(&trailing[1..]);
        }
    } else {
        res.push_str(&trailing);
    }
    Ok(Some(res))
}

/// Generates a single order key that sorts lexicographically strictly between `a` and `b`.
/// If `a` is `None`, inserts at the start before `b`.
/// If `b` is `None`, inserts at the end after `a`.
/// If both are `None`, returns the default starting key `"a0"`.
pub fn generate_key_between(a: Option<&str>, b: Option<&str>) -> Result<String, String> {
    let digits = BASE_62_DIGITS.as_bytes();
    let int_digits = BASE_52_DIGITS.as_bytes();

    if let Some(ka) = a {
        validate_order_key(ka, digits, int_digits)?;
    }
    if let Some(kb) = b {
        validate_order_key(kb, digits, int_digits)?;
    }

    if let (Some(ka), Some(kb)) = (a, b) {
        if ka >= kb {
            return Err(format!("a ({}) must be strictly less than b ({})", ka, kb));
        }
    }

    if a.is_none() {
        if b.is_none() {
            let head = int_digits[int_digits.len() / 2] as char;
            return Ok(format!("{}{}", head, digits[0] as char));
        }

        let kb = b.unwrap();
        let ib = get_integer_part(kb, int_digits)?;
        let fb = &kb[ib.len()..];
        if is_smallest_integer(ib, digits, int_digits) {
            let mid = midpoint("", Some(fb), digits)?;
            return Ok(format!("{}{}", ib, mid));
        }
        if ib < kb {
            return Ok(ib.to_string());
        }
        let res = decrement_integer(ib, digits, int_digits)?
            .ok_or_else(|| "cannot decrement any more".to_string())?;
        return Ok(res);
    }

    if b.is_none() {
        let ka = a.unwrap();
        let ia = get_integer_part(ka, int_digits)?;
        let fa = &ka[ia.len()..];
        let inc = increment_integer(ia, digits, int_digits)?;
        return match inc {
            Some(i) => Ok(i),
            None => {
                let mid = midpoint(fa, None, digits)?;
                Ok(format!("{}{}", ia, mid))
            }
        };
    }

    let ka = a.unwrap();
    let kb = b.unwrap();
    let ia = get_integer_part(ka, int_digits)?;
    let fa = &ka[ia.len()..];
    let ib = get_integer_part(kb, int_digits)?;
    let fb = &kb[ib.len()..];

    if ia == ib {
        let mid = midpoint(fa, Some(fb), digits)?;
        return Ok(format!("{}{}", ia, mid));
    }

    let inc = increment_integer(ia, digits, int_digits)?
        .ok_or_else(|| "cannot increment any more".to_string())?;
    if inc.as_str() < kb {
        return Ok(inc);
    }
    let mid = midpoint(fa, None, digits)?;
    Ok(format!("{}{}", ia, mid))
}

/// Generates `n` distinct, evenly spaced order keys sorted between `a` and `b`.
pub fn generate_n_keys_between(
    a: Option<&str>,
    b: Option<&str>,
    n: usize,
) -> Result<Vec<String>, String> {
    if n == 0 {
        return Ok(Vec::new());
    }
    if n == 1 {
        return Ok(vec![generate_key_between(a, b)?]);
    }
    if b.is_none() {
        let mut result = Vec::with_capacity(n);
        let mut prev = a.map(|s| s.to_string());
        for _ in 0..n {
            let next = generate_key_between(prev.as_deref(), None)?;
            result.push(next.clone());
            prev = Some(next);
        }
        return Ok(result);
    }

    // Bisect recursively
    let mid_idx = n / 2;
    let mid_key = generate_key_between(a, b)?;
    let left = generate_n_keys_between(a, Some(&mid_key), mid_idx)?;
    let right = generate_n_keys_between(Some(&mid_key), b, n - mid_idx - 1)?;

    let mut result = Vec::with_capacity(n);
    result.extend(left);
    result.push(mid_key);
    result.extend(right);
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_fractional_index_basics() {
        // Initial
        let first = generate_key_between(None, None).unwrap();
        assert_eq!(first, "a0");

        // Insert after
        let second = generate_key_between(Some(&first), None).unwrap();
        assert_eq!(second, "a1");
        assert!(first < second);

        // Insert between "a0" and "a1" -> "a0V"
        let mid = generate_key_between(Some(&first), Some(&second)).unwrap();
        assert_eq!(mid, "a0V");
        assert!(first < mid && mid < second);

        // Insert before "a0" -> "Zz"
        let before = generate_key_between(None, Some(&first)).unwrap();
        assert_eq!(before, "Zz");
        assert!(before < first);
    }

    #[test]
    fn test_multiple_insertions_preserve_order() {
        let mut keys: Vec<String> = Vec::new();
        let mut prev: Option<String> = None;
        for _ in 0..20 {
            let k = generate_key_between(prev.as_deref(), None).unwrap();
            keys.push(k.clone());
            prev = Some(k);
        }

        // Verify strictly ascending
        for i in 1..keys.len() {
            assert!(keys[i - 1] < keys[i]);
        }

        // Insert midway between every adjacent pair
        for i in 0..keys.len() - 1 {
            let mid = generate_key_between(Some(&keys[i]), Some(&keys[i + 1])).unwrap();
            assert!(keys[i] < mid);
            assert!(mid < keys[i + 1]);
        }
    }

    #[test]
    fn test_generate_n_keys() {
        let keys = generate_n_keys_between(None, None, 5).unwrap();
        assert_eq!(keys.len(), 5);
        for i in 1..keys.len() {
            assert!(keys[i - 1] < keys[i]);
        }
    }
}
