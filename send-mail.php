<?php
if ($_SERVER["REQUEST_METHOD"] === "POST") {
    // Sanitize inputs
    $name = htmlspecialchars(trim($_POST["full-name"] ?? ''));
    $email = htmlspecialchars(trim($_POST["email"] ?? ''));
    $message = htmlspecialchars(trim($_POST["message"] ?? ''));

    // Basic validation (optional but recommended)
    if (empty($name) || empty($email) || empty($message)) {
        echo "<script>alert('Please fill in all fields.'); window.history.back();</script>";
        exit;
    }

    // Email validation
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        echo "<script>alert('Invalid email address.'); window.history.back();</script>";
        exit;
    }

    // Email setup
    $to = "nitinjun006@gmail.com"; // your receiving email
    $subject = "New Message from Contact Form - Nexsphere Global";
    $body = "Name: $name\nEmail: $email\n\nMessage:\n$message";
    $headers = "From: noreply@nexsphere.in\r\n";
    $headers .= "Reply-To: $email\r\n";

    // Send email
    if (mail($to, $subject, $body, $headers)) {
        echo "<script>alert('Message sent successfully!'); window.location.href='contact.html';</script>";
    } else {
        echo "<script>alert('Failed to send message. Please try again.'); window.location.href='contact.html';</script>";
    }
} else {
    echo "Invalid request.";
}
?>
